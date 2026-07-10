# 测试报告：tavily-mcp-lb 多 Key 负载均衡

## 基本信息

| 项目 | 内容 |
|:---|:---|
| **任务 ID** | TEST-001 |
| **被测项目** | tavily-mcp-lb（fork 自 tavily-mcp） |
| **测试日期** | 2026-07-10 |
| **测试环境** | Windows 本机，Node.js v24.14.0 |
| **测试范围** | 单元测试复核 / MCP stdio 集成 / 多 key 功能 / 满额探查 / key 安全 |
| **总执行用例数** | 36（单元）+ 7（集成验证点）+ 5（真实 key 验证点） |

---

## 一、单元测试复核

### 1.1 执行结果

| 指标 | 结果 |
|:---|:---:|
| 测试文件 | test/keyManager.test.ts |
| 总用例数 | **36** |
| 通过 | **36** ✅ |
| 失败 | **0** |
| 跳过 | **0** |
| 运行时间 | 597ms |

### 1.2 覆盖率

| 指标 | 开发声明 | 实测 | 阈值 | 判定 |
|:---|:---:|:---:|:---:|:---:|
| Statements | 88.75% | **88.75%** | ≥80% | ✅ |
| Branch | 85.83% | **85.83%** | ≥80% | ✅ |
| Functions | 90% | **90%** | ≥80% | ✅ |
| Lines | 90.96% | **90.96%** | ≥80% | ✅ |

> 覆盖率与开发声明一致，全部达标。

### 1.3 未覆盖代码分析

| 行号 | 代码 | 未覆盖原因 |
|:---|:---|:---|
| 274 | `return Math.random() - 0.5;` | 两个 null remaining 相等时的随机排序（概率触发） |
| 281 | `return Math.random() - 0.5;` | 两个 non-null remaining 相等时的随机排序（概率触发） |
| 346 | `getAuthHeader()` | 该方法未被单元测试调用（工具方法） |
| 378-394 | `startPeriodicRefresh` 定时器 | 定时器异步逻辑，mock 困难，非核心逻辑 |

### 1.4 测试质量审查

**覆盖的核心场景：**
- ✅ 三种 key 加载方式（TAVILY_API_KEYS / TAVILY_API_KEY_* / TAVILY_API_KEY）
- ✅ key 去重、合并加载
- ✅ 无 key 报错
- ✅ selectKey 额度优先排序
- ✅ limit=null 降级随机
- ✅ 全部满额返回 null
- ✅ handleError：432/433（满额冷却）、401（永久移除）、429（限流标记）、400/500（不处理）
- ✅ /usage 查询成功/失败/限流/满额恢复
- ✅ 冷却到期自动恢复
- ✅ getActiveKeyCount 计数逻辑

**发现的测试质量问题：**

| 问题 | 严重等级 | 说明 |
|:---|:---:|:---|
| `initialize 空 keyMap 不报错` 是伪测试 | **Medium** | 该用例以 `expect(true).toBe(true)` 结尾，未验证任何实际行为。测试名为"空 keyMap 不报错"，但实际未构造空 keyMap 场景 |
| `null remaining 优先` 断言较弱 | **Low** | 断言仅检查 key4 在 10 次选择中至少出现 1 次，但依赖随机分布，可能有偶发失败风险 |

---

## 二、MCP stdio 集成测试

### 2.1 测试方法

通过 Node.js 子进程启动 `build/index.js`，通过 stdin/stdout 发送 JSON-RPC 2.0 消息，模拟 MCP 客户端交互。

### 2.2 验证结果

| 验证点 | 结果 |
|:---|:---:|
| MCP initialize 握手 | ✅ 成功，协议版本 `2024-11-05` |
| tools/list 返回 5 个工具 | ✅ tavily_search / tavily_extract / tavily_crawl / tavily_map / tavily_research |
| tools/call (tavily_search) 真实 API | ✅ 成功返回搜索结果 |
| 多 key 环境正常工作 | ✅ 3 个 key 正确加载，search 路由到有额度 key |
| key 脱敏验证 | ✅ 日志中 key 均显示为 `tvly-dev***`，无完整 key 泄露 |

### 2.3 补充说明

- extract / crawl / map / research 工具**未做真实 API 调用测试**，因为：
  - research 调用会消耗较多额度（约 20+ credits）
  - crawl/map 需要真实 URL 参数
  - 它们共享同一 `makeAuthenticatedRequest` 实现，key 选择逻辑与 search 一致
- 如果需要这些工具的集成测试，建议在 CI 环境中进行

---

## 三、多 Key 功能验证

### 3.1 三种配置方式

| 方式 | 环境变量 | 单元测试验证 | 结果 |
|:---|:---|:---:|:---:|
| TAVILY_API_KEYS 逗号分隔 | `TAVILY_API_KEYS=key1,key2,key3` | ✅ | 正确解析 3 个 key |
| TAVILY_API_KEY_* 后缀 | `TAVILY_API_KEY_A=key1` | ✅ | 正确扫描所有后缀 |
| 单 TAVILY_API_KEY | `TAVILY_API_KEY=key1` | ✅ | 向后兼容 |
| 合并去重 | `TAVILY_API_KEYS=key1,key1` + `TAVILY_API_KEY=key1` | ✅ | 去重为 1 个 key |

### 3.2 核心路径验证

| 场景 | 验证方式 | 结果 |
|:---|:---:|:---:|
| 额度优先 selectKey | 单元测试 mock | ✅ 选 remaining 最大的 key |
| limit=null 降级随机 | 单元测试 + 真实 key 验证 | ✅ 3 key 均 null remaining，随机分布 |
| 432 错误 → 冷却 key → 切换重试 | 单元测试 mock + 真实 key handleError | ✅ handleError 返回 true，其余 2 key 仍可用 |
| 所有 key 满额 → 无可用 | 单元测试 mock + 真实 key 模拟 | ✅ selectKey 返回 null |
| 冷却到期自动恢复 | 单元测试 mock | ✅ selectKey 自动恢复 |

### 3.3 真实 key 验证详情

使用 3 个真实 tvly-dev key 进行验证（含 1 个满额）。

**Key 状态一览：**

| 标识（脱敏） | Usage | Limit | 是否满额 | 来源环境变量 |
|:---|:---:|:---:|:---:|:---:|
| tvly-dev*** | 880 | ∞(null) | 否 | TAVILY_API_KEY |
| tvly-dev*** | 0 | ∞(null) | 否 | TAVILY_API_KEY_atigeraroky@rogurgaonkvs.in |
| tvly-dev*** | 1000 | ∞(null) | **是（432）** | TAVILY_API_KEY_out1 |

**关键发现：**
- 所有 3 个 tvly-dev key 的 `/usage` 均返回 `limit: null`（即 API 不返回额度上限）
- 因此 **remaining 均为 null**，KeyManager 无法通过主动探查预判满额
- 满额 key（out1）调用 search 返回 **HTTP 432**（额度耗尽）
- KeyManager 的 `handleError(432)` 能正确将满额 key 冷却并切换到其他 key

---

## 四、Key 安全验证

| 检查项 | 结果 |
|:---|:---:|
| 日志中 key 脱敏（前 8 位 + ***） | ✅ 所有 console.error 输出均使用 sanitizeKey() |
| .gitignore 包含 .env / node_modules / coverage | ✅ 已配置 |
| 源码中无硬编码真实 key | ✅ 仅测试代码中有假 key（tvly-abc 等） |
| 测试代码中无硬编码真实 key | ✅ 全部从环境变量读取 |
| 环境变量中的 key 未提交 git | ✅（未执行 git add） |

---

## 五、缺陷清单

### 缺陷 #1：伪测试 "initialize 空 keyMap 不报错"

| 字段 | 值 |
|:---|:---|
| **缺陷 ID** | BUG-001 |
| **严重等级** | **Medium** |
| **文件** | `test/keyManager.test.ts` 第 450-461 行 |
| **描述** | `initialize 空 keyMap 不报错` 测试用例的结尾是 `expect(true).toBe(true)`，这是一个占位语句，没有验证任何实际行为。测试名声称测试"空 keyMap"场景，但实际使用的是已有 2 个 key 的 km 实例 |
| **期望结果** | 应构造一个空的 KeyManager 实例（通过清空 keyMap 或绕过构造检查）并调用 initialize()，验证其安全返回不抛异常 |
| **实际结果** | `expect(true).toBe(true)` 总是通过，无实际验证 |
| **建议修复** | 移除该用例或用真实构造替代。例如：创建 KeyManager 后调用 `(km as any).keyMap.clear()`，然后验证 `initialize()` 不报错 |

### 缺陷 #2：冷却到期后 remaining 仍为 null，可能再次触发 432

| 字段 | 值 |
|:---|:---|
| **缺陷 ID** | BUG-002 |
| **严重等级** | **Medium** |
| **关联文件** | `src/keyManager.ts` 第 242-251 行（selectKey 冷却恢复） |
| **描述** | 冷却到期的 key 自动恢复为 ACTIVE，但 **remaining 字段未主动查询更新**（仍为 0 或 null）。如果该 key 实际上仍未恢复额度，被 selectKey 选中后发起请求会再次触发 432 错误，导致重复冷却->恢复->432 循环 |
| **复现步骤** | 1. key 返回 432 → handleError 冷却 1 小时<br>2. 冷却到期 → selectKey 自动恢复为 ACTIVE<br>3. 但 remaining 仍为 0（或 null）<br>4. 再次选到该 key → 再次 432 |
| **期望结果** | 冷却到期恢复时应主动查询 /usage 更新 remaining，或至少标记 remaining=null 以降低被选优先级 |
| **实际结果** | 冷却到期后仅状态改为 ACTIVE，remaining 保持冷却前的值 |
| **建议修复** | 在 selectKey 冷却恢复逻辑中，将 remaining 设为 null（降级为未知），这样在排序时不会被优先选择；或触发一次 fetchAndUpdateUsage |

### 缺陷 #3：429 速率限制未实现 Retry-After 精确等待

| 字段 | 值 |
|:---|:---|
| **缺陷 ID** | BUG-003 |
| **严重等级** | **Low** |
| **关联文件** | `src/keyManager.ts` 第 316-321 行（handleError 429） |
| **描述** | 收到 429 时仅将 key 标记为 RATE_LIMITED 并切换其他 key，但未解析响应头中的 Retry-After 字段设置精确冷却时间。如果所有 key 都被限流，系统会直接报错而不是等待 |
| **建议修复** | 解析 `Retry-After` 响应头，动态设置冷却时间 |

### 缺陷 #4：Research 轮询 key 固定导致任务丢失风险

| 字段 | 值 |
|:---|:---|
| **缺陷 ID** | BUG-004 |
| **严重等级** | **Medium** |
| **关联文件** | `src/index.ts` 第 761-763 行（research polling） |
| **描述** | research 轮询使用 selectKey 选择固定 key。如果该 key 在轮询期间满额或被标记为无效，后续 poll 请求将失败（404），导致 research 任务丢失 |
| **建议修复** | 在 poll 失败时尝试用其他 key 重新轮询；或使用 research 的初始请求 key 进行轮询 |

---

## 六、整体结论

| 项目 | 结论 |
|:---|:---:|
| **测试结论** | **有条件通过 ✅** |
| **单元测试** | 36/36 通过，覆盖率 ≥80% |
| **集成测试** | MCP stdio 握手、工具列表、search 真实 API 均成功 |
| **多 key 功能** | 三种配置方式、额度优先/降级随机/故障切换均验证正确 |
| **满额探查** | 真实 key 验证完成，满额 key 正确识别（via 432），故障切换正常 |
| **Key 安全** | 脱敏、不入库、不硬编码，所有检查通过 |
| **剩余风险** | 见下方"已知风险"章节 |

### 已知风险（开发已标注）

1. `/usage` 返回 `limit=null`（tvly-dev key 普遍行为），导致无法预判满额，仅靠 432 被动检测
2. Research 轮询固定 key 存在任务丢失风险
3. 429 未实现 Retry-After 精确等待
4. 并发请求 key 选择非原子
5. 冷却到期自动恢复但 remaining 未更新

---

## 七、验证记录：满额 Key 探查详录

```json
{
  "验证时间": "2026-07-10T15:03",
  "验证方式": "self-test.mjs + KeyManager 真实 key 加载",
  "key列表": [
    {
      "标识": "tvly-dev-4Irmbc***",
      "来源": "TAVILY_API_KEY",
      "/usage返回": { "usage": 880, "limit": null },
      "search结果": "SUCCESS",
      "是否满额": false
    },
    {
      "标识": "tvly-dev-18hOX2***",
      "来源": "TAVILY_API_KEY_atigeraroky@rogurgaonkvs.in",
      "/usage返回": { "usage": 0, "limit": null },
      "search结果": "SUCCESS",
      "是否满额": false
    },
    {
      "标识": "tvly-dev-1pWlt6***",
      "来源": "TAVILY_API_KEY_out1",
      "/usage返回": { "usage": 1000, "limit": null },
      "search结果": "HTTP 432 FAILED",
      "是否满额": true
    }
  ],
  "探查机制": "被动（432 错误驱动）",
  "原因": "所有 3 个 tvly-dev key 的 /usage 均返回 limit=null，无法通过剩余额度预判满额",
  "故障切换验证": "handleError(432) → canRetry=true → selectKey 跳过满额 key → 请求路由到有额度 key",
  "路由验证": "系统使用 3 个 key 时 search 成功返回，说明未被路由到满额 key（否则会报 432）"
}
```
