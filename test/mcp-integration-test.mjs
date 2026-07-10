/**
 * MCP stdio 集成测试
 * 通过 stdin/stdout 与 MCP server 交互，验证：
 * 1. initialize 握手
 * 2. tools/list 返回 5 个工具
 * 3. tools/call 调用 tavily_search 真实 API
 *
 * 用法：
 *   $env:TAVILY_API_KEY="tvly-dev-xxx"
 *   $env:TAVILY_API_KEY_out1="tvly-dev-yyy"
 *   $env:TAVILY_API_KEY_xxx="tvly-dev-zzz"
 *   $env:ALL_PROXY="socks5://127.0.0.1:7892"
 *   node test/mcp-integration-test.mjs
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import process from "process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = path.resolve(__dirname, "..", "build", "index.js");

// 从环境变量加载 key 数量统计
function countKeys() {
  const keys = new Set();
  const singleKey = process.env.TAVILY_API_KEY;
  if (singleKey) keys.add(singleKey);
  const keysEnv = process.env.TAVILY_API_KEYS;
  if (keysEnv) {
    keysEnv.split(",").map(k => k.trim()).filter(Boolean).forEach(k => keys.add(k));
  }
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("TAVILY_API_KEY_")) {
      const v = process.env[k];
      if (v && v.trim()) keys.add(v.trim());
    }
  }
  return keys.size;
}

let requestId = 0;
function nextId() {
  return ++requestId;
}

/**
 * 发送 JSON-RPC 请求并等待响应
 */
function sendRequest(proc, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId();
    const request = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }) + "\n";

    // 监听下一行响应
    const onData = (data) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          // 如果是响应（有 id 字段）
          if (parsed.id !== undefined && parsed.id !== null) {
            proc.stdout.removeListener("data", onData);
            resolve(parsed);
            return;
          }
          // 如果是通知（无 id），忽略
        } catch (e) {
          // 非 JSON 行，忽略（如 console.error 输出）
        }
      }
    };

    proc.stdout.on("data", onData);
    proc.stdin.write(request);

    // 超时处理
    setTimeout(() => {
      proc.stdout.removeListener("data", onData);
      reject(new Error(`Request timeout: ${method}`));
    }, 30000);
  });
}

async function main() {
  const keyCount = countKeys();
  console.log(`=== MCP stdio 集成测试 ===`);
  console.log(`构建产物: ${SERVER_SCRIPT}`);
  console.log(`加载了 ${keyCount} 个 key`);
  console.log(`代理设置: ${process.env.ALL_PROXY || "无"}\n`);

  // 启动 MCP server
  console.log("1. 启动 MCP server...");
  const proc = spawn("node", [SERVER_SCRIPT], {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
    cwd: path.resolve(__dirname, ".."),
  });

  // 收集 stderr 输出（用于调试）
  let stderrData = "";
  proc.stderr.on("data", (data) => {
    stderrData += data.toString();
  });

  let exitCode = null;
  proc.on("exit", (code) => {
    exitCode = code;
  });

  try {
    // 2. 初始化握手
    console.log("2. 执行 MCP initialize 握手...");
    const initResult = await sendRequest(proc, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: "mcp-integration-test",
        version: "1.0.0",
      },
    });

    console.log(`   响应: ${JSON.stringify(initResult, null, 2).substring(0, 200)}`);
    if (initResult.error) {
      console.error(`   ❌ initialize 失败: ${initResult.error.message}`);
      proc.kill();
      process.exit(1);
    }
    console.log("   ✅ initialize 成功\n");

    // 3. 发送 initialized 通知
    console.log("3. 发送 notifications/initialized...");
    const notif = JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }) + "\n";
    proc.stdin.write(notif);
    console.log("   ✅ 通知已发送\n");

    // 短暂等待
    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. 列出工具
    console.log("4. 执行 tools/list...");
    const toolsResult = await sendRequest(proc, "tools/list");
    if (toolsResult.error) {
      console.error(`   ❌ tools/list 失败: ${toolsResult.error.message}`);
      proc.kill();
      process.exit(1);
    }

    const tools = toolsResult.result?.tools || [];
    console.log(`   返回 ${tools.length} 个工具:`);
    const toolNames = tools.map(t => t.name);
    toolNames.forEach(name => console.log(`   - ${name}`));

    const expectedTools = ["tavily_search", "tavily_extract", "tavily_crawl", "tavily_map", "tavily_research"];
    let allToolsOk = true;
    for (const expected of expectedTools) {
      if (!toolNames.includes(expected)) {
        console.error(`   ❌ 缺少工具: ${expected}`);
        allToolsOk = false;
      }
    }
    if (allToolsOk) {
      console.log("   ✅ 5 个工具齐全\n");
    } else {
      console.error("   ❌ 工具列表不完整\n");
      proc.kill();
      process.exit(1);
    }

    // 5. 调用 tavily_search（真实 API）
    console.log("5. 调用 tools/call (tavily_search)...");
    const searchResult = await sendRequest(proc, "tools/call", {
      name: "tavily_search",
      arguments: {
        query: "test query",
        max_results: 5,
        search_depth: "basic",
      },
    });

    if (searchResult.error) {
      console.error(`   ❌ search 调用失败: ${searchResult.error.message}`);
      // 检查 stderr 是否有更多信息
      const lastStderr = stderrData.split("\n").slice(-5).join("\n");
      console.error(`   最近 stderr: ${lastStderr}`);
      proc.kill();
      process.exit(1);
    }

    const content = searchResult.result?.content?.[0]?.text || "";
    const isError = searchResult.result?.isError;
    if (isError) {
      console.error(`   ❌ search 返回错误: ${content.substring(0, 200)}`);
      proc.kill();
      process.exit(1);
    }

    console.log(`   ✅ search 成功!`);
    console.log(`   结果预览: ${content.substring(0, 200)}...\n`);

    // 6. 打印 stderr 中的 key 信息（脱敏后）
    console.log("6. 检查服务端日志（key 脱敏验证）...");
    const stderrLines = stderrData.split("\n").filter(l => l.trim());
    const keyLogLines = stderrLines.filter(l =>
      l.includes("key") && (l.includes("***") || l.includes("sanitize"))
    );
    if (keyLogLines.length > 0) {
      console.log(`   找到 ${keyLogLines.length} 条 key 相关日志:`);
      keyLogLines.slice(0, 5).forEach(l => console.log(`   ${l.trim()}`));
    }

    // 检查是否有完整 key 泄露
    const tvlyMatches = stderrData.match(/tvly-[a-zA-Z0-9]{10,}/g);
    if (tvlyMatches) {
      console.error(`   ❌ 发现完整 key 泄露! 匹配数: ${tvlyMatches.length}`);
      tvlyMatches.forEach(m => console.error(`   ${m}`));
      proc.kill();
      process.exit(1);
    } else {
      console.log("   ✅ 无完整 key 泄露\n");
    }

    // 汇总
    console.log("=== 集成测试总结 ===");
    console.log("✅ initialize 握手成功");
    console.log(`✅ tools/list 返回 ${tools.length} 个工具（含全部 5 个预期工具）`);
    console.log("✅ tavily_search 真实 API 调用成功");
    console.log("✅ key 均已脱敏，无完整 key 泄露");

    proc.kill();
    console.log("\n=== 全部通过 ===");
  } catch (err) {
    console.error(`\n❌ 测试异常: ${err.message}`);
    // 打印 stderr 以帮助调试
    if (stderrData) {
      const lastLines = stderrData.split("\n").slice(-10).join("\n");
      console.error(`最近 stderr:\n${lastLines}`);
    }
    proc.kill();
    process.exit(1);
  }
}

main();
