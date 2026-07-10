# Tavily MCP Server（多 Key 负载均衡增强版）

![GitHub Repo stars](https://img.shields.io/github/stars/touful/tavily-mcp?style=social)
![npm](https://img.shields.io/npm/dt/tavily-mcp)
[![PR #185](https://img.shields.io/badge/upstream%20PR-%23185-blue)](https://github.com/tavily-ai/tavily-mcp/pull/185)

> **这不是官方 `tavily-ai/tavily-mcp`，而是其 fork。** 本 fork 在官方全部功能基础上新增了**多 API key 负载均衡**能力——透明池化多个 Tavily key，按剩余额度优先路由，自动探查并剔除满额 key，故障自动切换，避免单 key 耗尽导致服务中断。完整保留官方所有工具（search / extract / crawl / map / research）和 keyless 模式，stdio MCP 协议不变。

- **上游官方仓库**：[tavily-ai/tavily-mcp](https://github.com/tavily-ai/tavily-mcp)
- **本 fork 仓库**：[touful/tavily-mcp](https://github.com/touful/tavily-mcp)
- **上游 PR**：[#185](https://github.com/tavily-ai/tavily-mcp/pull/185)

---

## 为什么需要这个 Fork？

Tavily 免费 key（tvly-dev）每月仅 1000 credits，个人免费额度很快会用完。官方 `tavily-mcp` 只支持设置单个 `TAVILY_API_KEY` 环境变量；即便配置多个 `TAVILY_API_KEY_<后缀>` 形式的变量，也只会使用第一个找到的 key，其余被忽略。一旦用完额度，就必须手动换 key 并重启 MCP 进程，导致服务中断。

**本 fork 解决的核心问题：**
- 多 key 池化管理，一次配置多个 key，自动轮换，无需手动干预
- 按剩余额度智能分配，优先使用余量最多的 key
- 满额 key 自动探查并冷却，不出错误到用户端
- 故障自动切换重试，单 key 耗尽不影响整体服务
- 完全向后兼容：只配 `TAVILY_API_KEY` 时行为与官方完全一致

---

## 核心功能

| 功能 | 说明 |
|:---|:---|
| 🔑 **多 key 池化管理** | 支持从三种环境变量加载 key，自动去重合并 |
| 📊 **额度优先分配** | 优先选择剩余额度最多的 key（通过 `/usage` 端点查询） |
| 🎲 **降级轮询兜底** | 额度未知时随机选择 key（免费 key 的 `/usage` 返回 `limit=null`） |
| 🛡️ **满额自动探查** | 432/433 错误驱动 + `/usage` 主动查询双轨制，满额 key 自动冷却 1 小时 |
| ⏳ **限流精确等待** | 429 读取 `retry-after` 响应头，精确设置冷却时间（上限 5 分钟） |
| ❌ **无效 key 永久移除** | 401 错误自动标记无效并移出候选池 |
| 🔄 **故障自动切换** | 每个请求尝试最多 N 次（N=key 总数），自动跳过失败 key |
| 🔁 **定时刷新额度** | 每 5 分钟自动查询所有 key 的 `/usage`，恢复已恢复额度的 key |
| 🔒 **Key 脱敏日志** | 所有日志输出仅显示 key 前 8 位 + `***`，绝不泄露完整 key |
| ✅ **向后兼容** | 单 key 模式完全退化为官方原行为，所有官方工具和 keyless 模式保留 |

---

## 配置方法

### Key 格式要求

所有 key 值必须以 `tvly-` 开头（Tavily 标准 key 前缀），否则会被自动跳过。

### 方式一：`TAVILY_API_KEYS` 逗号分隔（推荐）

最简单直接的方式，将多个 key 以逗号分隔写入一个环境变量：

```bash
TAVILY_API_KEYS="tvly-xxxxxxxxxxxxxxxxxxxxxxxx, tvly-yyyyyyyyyyyyyyyyyyyyyyyy, tvly-zzzzzzzzzzzzzzzzzzzzzzzz"
```

**MCP 客户端配置示例（opencode / Claude Desktop）：**

```json
{
  "mcpServers": {
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "github:touful/tavily-mcp"],
      "env": {
        "TAVILY_API_KEYS": "tvly-xxxxxxxxxxxxxxxxxxxxxxxx,tvly-yyyyyyyyyyyyyyyyyyyyyyyy,tvly-zzzzzzzzzzzzzzzzzzzzzzzz"
      }
    }
  }
}
```

### 方式二：`TAVILY_API_KEY_<后缀>` 多个后缀变量

适合需要在不同 shell 脚本或 Docker 容器中灵活管理多个 key 的场景，每个 key 单独一个环境变量：

```bash
TAVILY_API_KEY_default="tvly-xxxxxxxxxxxxxxxxxxxxxxxx"
TAVILY_API_KEY_backup="tvly-yyyyyyyyyyyyyyyyyyyyyyyy"
TAVILY_API_KEY_extra="tvly-zzzzzzzzzzzzzzzzzzzzzzzz"
```

**MCP 客户端配置示例：**

```json
{
  "mcpServers": {
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "github:touful/tavily-mcp"],
      "env": {
        "TAVILY_API_KEY_default": "tvly-xxxxxxxxxxxxxxxxxxxxxxxx",
        "TAVILY_API_KEY_backup": "tvly-yyyyyyyyyyyyyyyyyyyyyyyy",
        "TAVILY_API_KEY_extra": "tvly-zzzzzzzzzzzzzzzzzzzzzzzz"
      }
    }
  }
}
```

### 方式三：`TAVILY_API_KEY` 单 key（完全向后兼容）

只配一个 key，行为与官方 `tavily-mcp` 完全一致：

```json
{
  "mcpServers": {
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "github:touful/tavily-mcp"],
      "env": {
        "TAVILY_API_KEY": "tvly-xxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### 配置优先级

三种方式可以同时使用，系统会自动合并去重。加载优先级（仅影响日志显示顺序，不影响实际 key 选择）：

1. `TAVILY_API_KEYS`
2. `TAVILY_API_KEY_<任意后缀>`
3. `TAVILY_API_KEY`

---

## 使用方式

### 通过 npx 运行（推荐，无需克隆仓库）

```bash
npx -y github:touful/tavily-mcp
```

首次运行会自动从 GitHub 下载并安装，后续有本地缓存，启动速度更快。

> **注意**：如果访问 GitHub 需要代理，请先在终端设置 `set HTTPS_PROXY=http://127.0.0.1:7890`（根据实际代理配置调整）。

### opencode 配置

在 opencode 的 `opencode.json` 中添加 MCP 配置：

```json
{
  "mcpServers": {
    "tavily-mcp-lb": {
      "command": "npx",
      "args": ["-y", "github:touful/tavily-mcp"],
      "env": {
        "TAVILY_API_KEYS": "tvly-key1,tvly-key2,tvly-key3",
        "DEFAULT_PARAMETERS": "{\"search_depth\": \"advanced\", \"max_results\": 10}"
      }
    }
  }
}
```

### Claude Desktop 配置

在 Claude Desktop 的 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "tavily-mcp-lb": {
      "command": "npx",
      "args": ["-y", "github:touful/tavily-mcp"],
      "env": {
        "TAVILY_API_KEYS": "tvly-key1,tvly-key2,tvly-key3"
      }
    }
  }
}
```

### Keyless 模式

不设置任何 key 时自动进入 keyless 模式（与官方行为一致），search 和 extract 工具可用（有限额），其余工具返回提示。

### 可选：默认参数

通过 `DEFAULT_PARAMETERS` 环境变量设置 search 工具的默认值：

```json
{ "search_depth": "advanced", "max_results": 10, "include_images": true }
```

### 可选：用户标识

通过 `TAVILY_HUMAN_ID` 环境变量标识终端用户。Tavily 服务端会对其做 SHA-256 哈希后存储，不会保存原始值。建议使用内部用户 ID 等不透明标识，避免直接使用邮箱等 PII。

---

## 负载均衡策略

### Key 选择逻辑（selectKey）

1. **额度优先**：从所有活跃 key 中选 `remaining` 最大的
2. **额度未知优先探查**：`remaining=null` 的 key 排在最前（鼓励探索未知额度）
3. **同级随机打散**：剩余额度相同的 key 随机选取，避免热点集中
4. **冷却中跳过**：状态为 `QUOTA_EXHAUSTED` 且在冷却期内的 key 跳过
5. **无效 key 跳过**：永久移除的 `INVALID` key 跳过

### 错误码处理

| HTTP 状态码 | 含义 | 处理方式 |
|:---|:---|:---|
| 432 | 月度额度耗尽 | 标记为 `QUOTA_EXHAUSTED`，冷却 1 小时 |
| 433 | 预付额度耗尽 | 同 432，冷却 1 小时 |
| 429 | 临时速率限制 | 标记为 `RATE_LIMITED`，读取 `retry-after` 精确冷却（上限 5 分钟） |
| 401 | 无效 key | 标记为 `INVALID`，永久移出候选池 |
| 400 / 500 | 请求或服务端错误 | 不处理 key，直接向上报错 |

### 请求重试流程

```
发起请求 → selectKey() 选 key → 调用 Tavily API
  ├─ 成功 → 返回结果
  └─ 失败（432/433/429/401）
      ├─ 有其他可用 key → handleError() 标记当前 key → 切换到下一个 key 重试
      └─ 无可用 key → 抛出详细错误（含 key 状态摘要和预计恢复时间）
```

最多重试 N 次（N = key 总数），确保不因单个 key 故障丢弃请求。

---

## 与官方 `tavily-ai/tavily-mcp` 的区别

| 维度 | 官方 | 本 fork |
|:---|:---|:---|
| **API Key 数量** | 仅支持单个 `TAVILY_API_KEY` | 支持 `TAVILY_API_KEYS`、`TAVILY_API_KEY_*`、`TAVILY_API_KEY` 三种方式 |
| **Key 池化管理** | 无 | `src/keyManager.ts` KeyManager 模块 |
| **额度优先路由** | 无 | `/usage` 查询 + 剩余额度排序 |
| **故障切换** | 单 key 耗尽即中断 | 自动切换重试，最多 N 次 |
| **Key 脱敏** | 无 | 所有日志输出脱敏（前 8 位 + `***`） |
| **工具集** | search / extract / crawl / map / research | 完全相同，无删减 |
| **Keyless 模式** | 支持 | 支持，行为一致 |
| **MCP 协议** | stdio JSON-RPC 2.0 | 完全相同 |
| **默认参数** | `DEFAULT_PARAMETERS` | 保留 |
| **用户标识** | `TAVILY_HUMAN_ID` | 保留 |

**文件级改动：**
- 新增 `src/keyManager.ts`：KeyManager 模块（~530 行）
- 改造 `src/index.ts`：集成多 key 支持，`makeAuthenticatedRequest` 统一重试逻辑
- 其余文件（`package.json` / `tsconfig.json` / `vitest.config.ts` 等）基本未改

---

## 已知限制

| 限制 | 说明 | 影响 |
|:---|:---|:---|
| **免费 key `/usage` 不返回 limit** | tvly-dev key 的 `/usage` 返回 `limit=null`，无法预判满额 | 主要靠 432 被动检测，首次请求可能打到满额 key 触发一次错误 |
| **selectKey 非原子** | stdio 模式下请求串行处理，无并发竞争 | 当前无影响；未来如支持并发需加锁 |
| **Research 轮询 key 固定** | research 的初始 key 与轮询 key 绑定，key 失效后轮询可能 404 | 极端场景，当前风险较低 |
| **429 Retry-After 解析** | 当前已实现 Retry-After 响应头解析和精确冷却，但仅适用于 429（432/433 使用固定 1 小时） | 低影响 |
| **冷却到期后 remaining 可能不准** | 冷却到期恢复 ACTIVE 时未重新查询 `/usage` | 下一次请求触发时才会知道真实状态 |

---

## 测试与质量

| 指标 | 数据 |
|:---|:---|
| **单元测试** | 36 个用例（`test/keyManager.test.ts`），全部通过 |
| **集成测试** | MCP stdio 握手、tools/list 返回 5 个工具、tavily_search 真实 API 调用验证 |
| **覆盖率** | Statements 88.75%、Branch 85.83%、Functions 90%、Lines 90.96% |
| **真实 key 验证** | 3 个 tvly-dev key（含 1 个满额）完成端到端验证：满额探查、故障切换、路由正确性 |
| **Key 安全** | 日志脱敏 ✓、无硬编码 ✓、`.gitignore` 排除 `.env` ✓ |

---

## 致谢

感谢 [Tavily](https://tavily.com/) 及 [tavily-ai/tavily-mcp](https://github.com/tavily-ai/tavily-mcp) 官方项目提供出色的 MCP 搜索服务。本 fork 基于官方 main 分支，旨在增强多 key 场景的可用性，不替代官方功能。

也感谢 [Model Context Protocol](https://modelcontextprotocol.io) 和 [Anthropic](https://anthropic.com) 为 AI 工具互操作提供的开放标准。

---

## 开源许可

MIT License —— 与上游一致。
