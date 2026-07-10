/**
 * 自测脚本：验证 KeyManager 多 key 负载均衡和满额探查
 * 用法：设置环境变量后运行
 *   $env:TAVILY_API_KEY="key1"
 *   $env:TAVILY_API_KEY_out1="key2"  
 *   $env:TAVILY_API_KEY_atigeraroky@rogurgaonkvs.in="key3"
 *   node test/self-test.mjs
 */

import https from "https";

const USAGE_URL = "https://api.tavily.com/usage";
const SEARCH_URL = "https://api.tavily.com/search";

// 从环境变量加载 key
function loadKeys() {
  const keys = [];
  const singleKey = process.env.TAVILY_API_KEY;
  if (singleKey) keys.push(singleKey);
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("TAVILY_API_KEY_")) {
      const v = process.env[k];
      if (v && v.trim()) keys.push(v.trim());
    }
  }
  return [...new Set(keys)];
}

function fetchUsage(key) {
  return new Promise((resolve, reject) => {
    const url = new URL(USAGE_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        accept: "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ error: "parse error", raw: data });
          }
        } else {
          resolve({ error: `status ${res.statusCode}`, body: data.substring(0, 200) });
        }
      });
    });
    req.on("error", (e) => resolve({ error: e.message }));
    req.end();
  });
}

function doSearch(key, query) {
  return new Promise((resolve, reject) => {
    const url = new URL(SEARCH_URL);
    const body = JSON.stringify({
      query,
      api_key: key,
      max_results: 5,
      search_depth: "basic",
    });
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            resolve({
              success: true,
              result_count: json.results?.length || 0,
              first_title: json.results?.[0]?.title || "N/A",
              status: res.statusCode,
            });
          } catch (e) {
            resolve({ success: false, error: "parse error", status: res.statusCode });
          }
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}`, body: data.substring(0, 300), status: res.statusCode });
        }
      });
    });
    req.on("error", (e) => resolve({ success: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

async function main() {
  const keys = loadKeys();
  console.log(`=== Tavily KeyManager 自测 ===`);
  console.log(`加载了 ${keys.length} 个 key:\n`);

  // 1. 查询各 key 的 /usage
  console.log("--- /usage 查询结果 ---");
  for (const [i, key] of keys.entries()) {
    const shortKey = key.substring(0, 20) + "...";
    const usageData = await fetchUsage(key);
    if (usageData.error) {
      console.log(`Key ${i + 1} (${shortKey}): ERROR - ${usageData.error}`);
    } else {
      const ku = usageData.key || {};
      const usage = ku.usage ?? "?";
      const limit = ku.limit ?? "∞";
      const remaining = limit !== "∞" && limit !== null ? limit - usage : "∞";
      const exhausted = limit !== "∞" && limit !== null && usage >= limit;
      console.log(
        `Key ${i + 1} (${shortKey}): usage=${usage}, limit=${limit}, ` +
        `remaining=${remaining}${exhausted ? " [满额!]" : ""}`
      );
    }
  }

  // 2. 用每个 key 分别做一次 search，看哪些成功哪些失败
  console.log("\n--- Search 测试（每个 key 单独测试）---");
  for (const [i, key] of keys.entries()) {
    const shortKey = key.substring(0, 20) + "...";
    const result = await doSearch(key, "test query");
    if (result.success) {
      console.log(
        `Key ${i + 1} (${shortKey}): SUCCESS - ` +
        `${result.result_count} results, first: ${result.first_title}`
      );
    } else {
      console.log(
        `Key ${i + 1} (${shortKey}): FAILED - ${result.error}`
      );
    }
  }

  console.log("\n=== 自测完成 ===");
}

main().catch(console.error);
