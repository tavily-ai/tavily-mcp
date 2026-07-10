# Tavily MCP Server (Multi-Key Load Balancer Enhanced)

![GitHub Repo stars](https://img.shields.io/github/stars/touful/tavily-mcp?style=social)
![npm](https://img.shields.io/npm/dt/tavily-mcp)
[![PR #185](https://img.shields.io/badge/upstream%20PR-%23185-blue)](https://github.com/tavily-ai/tavily-mcp/pull/185)

> **This is NOT the official `tavily-ai/tavily-mcp` — it's a fork.** This fork adds **multi API key load balancing** on top of all official features: transparently pooling multiple Tavily keys, routing by remaining quota, auto-detecting and excluding exhausted keys, failing over automatically — preventing single-key exhaustion from disrupting your service. All official tools (search / extract / crawl / map / research) and keyless mode are preserved; the stdio MCP protocol remains unchanged.

- **Upstream official repo**: [tavily-ai/tavily-mcp](https://github.com/tavily-ai/tavily-mcp)
- **This fork repo**: [touful/tavily-mcp](https://github.com/touful/tavily-mcp)
- **Upstream PR**: [#185](https://github.com/tavily-ai/tavily-mcp/pull/185)

---

## Why This Fork?

Tavily's free keys (tvly-dev) are limited to 1,000 credits per month — the personal free quota runs out quickly. The official `tavily-mcp` only supports a single `TAVILY_API_KEY` environment variable; even if you set multiple `TAVILY_API_KEY_<suffix>` variables, it only uses the first one found, ignoring the rest. Once your quota is exhausted, you must manually swap keys and restart the MCP process, causing service interruptions.

**What this fork solves:**
- Multi-key pooling — configure multiple keys at once, automatic rotation, no manual intervention
- Intelligent quota-based allocation — prioritizes keys with the most remaining credits
- Auto-detection of exhausted keys — marks them as unavailable before users see errors
- Automatic failover — single key exhaustion doesn't affect overall service
- Full backward compatibility — behaves exactly like the official version when only `TAVILY_API_KEY` is set

---

## Core Features

| Feature | Description |
|:---|:---|
| 🔑 **Multi-key pooling** | Loads keys from three environment variable formats, auto-deduplication |
| 📊 **Quota-prioritized routing** | Selects the key with the most remaining credits (via `/usage` endpoint) |
| 🎲 **Fallback round-robin** | Random selection when quota is unknown (free keys return `limit=null` from `/usage`) |
| 🛡️ **Auto-detection of exhaustion** | 432/433 error-driven + `/usage` proactive query, exhausted keys cooled for 1 hour |
| ⏳ **Precise rate-limit waiting** | Reads `retry-after` header for 429 responses, sets exact cooldown (max 5 minutes) |
| ❌ **Invalid key removal** | Permanently removes keys returning 401 from the candidate pool |
| 🔄 **Automatic failover** | Retries up to N times per request (N = total key count), skipping failed keys |
| 🔁 **Periodic quota refresh** | Queries `/usage` for all keys every 5 minutes, reactivates recovered keys |
| 🔒 **Key sanitization in logs** | All log output shows only first 8 characters + `***`, never leaks full keys |
| ✅ **Backward compatibility** | Single-key mode degrades to exact original behavior; all official tools and keyless mode preserved |

---

## Configuration

### Key Format Requirement

All key values must start with `tvly-` (Tavily standard key prefix), otherwise they are automatically skipped.

### Method 1: `TAVILY_API_KEYS` comma-separated (Recommended)

The simplest approach — write multiple keys in a single environment variable separated by commas:

```bash
TAVILY_API_KEYS="tvly-xxxxxxxxxxxxxxxxxxxxxxxx, tvly-yyyyyyyyyyyyyyyyyyyyyyyy, tvly-zzzzzzzzzzzzzzzzzzzzzzzz"
```

**MCP client configuration (opencode / Claude Desktop):**

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

### Method 2: `TAVILY_API_KEY_<suffix>` multiple suffix variables

Ideal for managing keys across different shell scripts or Docker containers, one variable per key:

```bash
TAVILY_API_KEY_default="tvly-xxxxxxxxxxxxxxxxxxxxxxxx"
TAVILY_API_KEY_backup="tvly-yyyyyyyyyyyyyyyyyyyyyyyy"
TAVILY_API_KEY_extra="tvly-zzzzzzzzzzzzzzzzzzzzzzzz"
```

**MCP client configuration:**

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

### Method 3: `TAVILY_API_KEY` single key (fully backward compatible)

Set a single key, behaves exactly like the official `tavily-mcp`:

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

### Configuration Priority

All three methods can be used simultaneously; the system auto-merges and deduplicates. Loading priority (affects log display order only, not key selection):

1. `TAVILY_API_KEYS`
2. `TAVILY_API_KEY_<any suffix>`
3. `TAVILY_API_KEY`

---

## Usage

### Run via npx (recommended, no clone required)

```bash
npx -y github:touful/tavily-mcp
```

The first run downloads and installs from GitHub automatically; subsequent runs use the local cache for faster startup.

> **Note**: If you need a proxy to access GitHub, set it in your terminal first: `export HTTPS_PROXY=http://127.0.0.1:7890` (adjust to your actual proxy configuration).

### opencode configuration

Add MCP configuration to opencode's `opencode.json`:

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

### Claude Desktop configuration

Add to Claude Desktop's `claude_desktop_config.json`:

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

### Keyless Mode

When no keys are set, the server automatically enters keyless mode (same as official behavior). The search and extract tools are available (with limits); other tools return a prompt message.

### Optional: Default Parameters

Set default values for the search tool via the `DEFAULT_PARAMETERS` environment variable:

```json
{ "search_depth": "advanced", "max_results": 10, "include_images": true }
```

### Optional: User Identification

Set the `TAVILY_HUMAN_ID` environment variable to identify the end user. Tavily hashes this with SHA-256 on the server side before storage — the raw value is never persisted. Prefer opaque identifiers (e.g., internal user IDs) over raw PII like email addresses.

---

## Load Balancing Strategy

### Key Selection Logic (selectKey)

1. **Quota-priority**: Selects the active key with the highest `remaining` value
2. **Unknown-first exploration**: Keys with `remaining=null` are prioritized to encourage exploration
3. **Peer random sharding**: Keys with equal remaining quotas are randomly selected to avoid hotspots
4. **Cooldown skip**: Keys with `QUOTA_EXHAUSTED` status and active cooldown are skipped
5. **Invalid skip**: Permanently removed `INVALID` keys are skipped

### Error Code Handling

| HTTP Status | Meaning | Handling |
|:---|:---|:---|
| 432 | Monthly quota exhausted | Marked `QUOTA_EXHAUSTED`, cooled for 1 hour |
| 433 | Prepaid quota exhausted | Same as 432, cooled for 1 hour |
| 429 | Temporary rate limit | Marked `RATE_LIMITED`, reads `retry-after` for precise cooldown (max 5 minutes) |
| 401 | Invalid key | Marked `INVALID`, permanently removed from candidate pool |
| 400 / 500 | Request or server error | No key status change, error propagated upstream |

### Request Retry Flow

```
Request → selectKey() choose key → Call Tavily API
  ├─ Success → Return result
  └─ Failure (432/433/429/401)
      ├─ Other keys available → handleError() mark current key → Switch to next key, retry
      └─ No keys available → Throw detailed error (with key status summary and estimated recovery time)
```

Maximum N retries (N = total key count), ensuring no request is dropped due to a single key failure.

---

## Differences from Upstream `tavily-ai/tavily-mcp`

| Dimension | Official | This Fork |
|:---|:---|:---|
| **API Key count** | Single `TAVILY_API_KEY` only | Supports `TAVILY_API_KEYS`, `TAVILY_API_KEY_*`, `TAVILY_API_KEY` |
| **Key pooling** | None | `src/keyManager.ts` KeyManager module |
| **Quota-prioritized routing** | None | `/usage` query + remaining-based sorting |
| **Failover** | Single-key exhaustion breaks service | Auto-switch retry, up to N times |
| **Key sanitization** | None | All logs sanitized (first 8 chars + `***`) |
| **Tools** | search / extract / crawl / map / research | Identical, no removal |
| **Keyless mode** | Supported | Supported, identical behavior |
| **MCP protocol** | stdio JSON-RPC 2.0 | Identical |
| **Default parameters** | `DEFAULT_PARAMETERS` | Preserved |
| **User identification** | `TAVILY_HUMAN_ID` | Preserved |

**File-level changes:**
- Added `src/keyManager.ts`: KeyManager module (~530 lines)
- Modified `src/index.ts`: Integrated multi-key support, unified retry logic in `makeAuthenticatedRequest`
- Other files (`package.json` / `tsconfig.json` / `vitest.config.ts` etc.) largely unchanged

---

## Known Limitations

| Limitation | Detail | Impact |
|:---|:---|:---|
| **Free key `/usage` returns no limit** | tvly-dev keys return `limit=null` from `/usage`, preventing proactive exhaustion detection | Relies primarily on 432 passive detection; first request may hit an exhausted key, triggering one error |
| **selectKey is non-atomic** | Requests are serial in stdio mode, no concurrent contention | No current impact; locking would be needed for future concurrency support |
| **Research polling key is fixed** | The research initial request key is bound to polling; if the key fails, polling may return 404 | Edge case, low current risk |
| **Cooldown expiry may have stale remaining** | When cooldown expires and key is reactivated, `/usage` is not re-queried | True state revealed on next request |

---

## Testing & Quality

| Metric | Data |
|:---|:---|
| **Unit tests** | 36 cases (`test/keyManager.test.ts`), all passing |
| **Integration tests** | MCP stdio handshake, tools/list returns 5 tools, tavily_search real API call verified |
| **Coverage** | Statements 88.75%, Branch 85.83%, Functions 90%, Lines 90.96% |
| **Real key validation** | 3 tvly-dev keys (including 1 exhausted) end-to-end verified: exhaustion detection, failover, routing correctness |
| **Key security** | Log sanitization ✓, No hardcoded keys ✓, `.gitignore` excludes `.env` ✓ |

---

## Acknowledgments

Thanks to [Tavily](https://tavily.com/) and the [tavily-ai/tavily-mcp](https://github.com/tavily-ai/tavily-mcp) official project for providing an excellent MCP search service. This fork is based on the official main branch, aiming to enhance usability in multi-key scenarios without replacing official functionality.

Also thanks to [Model Context Protocol](https://modelcontextprotocol.io) and [Anthropic](https://anthropic.com) for the open standards enabling AI tool interoperability.

---

## License

MIT License — same as upstream.
