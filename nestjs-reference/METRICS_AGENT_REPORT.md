# Metrics Agent Audit Report — NestJS Payroll + JPM

**Date:** 2025-01-28  
**Scope:** `nestjs-reference/metrics/*`, `nestjs-reference/common/interceptors/http-metrics.interceptor.ts`  
**Agent:** Metrics Agent (Prometheus/Grafana Alloy compliance)

---

## 1. Metric Naming Consistency Audit

### ✅ PASS — All metrics follow Prometheus naming conventions

| Metric | Type | Labels | Status |
| --- | --- | --- | --- |
| `http_requests_total` | Counter | `method`, `route`, `status_code` | ✅ snake_case, `_total` suffix |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | ✅ snake_case, `_seconds` suffix |
| `http_errors_total` | Counter | `method`, `route`, `status_code` | ✅ snake_case, `_total` suffix |
| `payroll_runs_created_total` | Counter | `env` | ✅ snake_case, `_total` suffix |
| `payroll_runs_approved_total` | Counter | `env` | ✅ snake_case, `_total` suffix |
| `payroll_runs_submitted_total` | Counter | `status`, `env` | ✅ snake_case, `_total` suffix |
| `payroll_run_amount_usd` | Histogram | `env` | ✅ snake_case, domain unit |
| `payroll_payments_total` | Counter | `status`, `env` | ✅ snake_case, `_total` suffix |
| `payroll_jpmc_api_duration_seconds` | Histogram | `operation` | ✅ snake_case, `_seconds` suffix |
| `jpm_api_calls_total` | Counter | `operation`, `status` | ✅ snake_case, `_total` suffix |
| `jpm_api_duration_seconds` | Histogram | `operation` | ✅ snake_case, `_seconds` suffix |
| `jpm_callback_verifications_total` | Counter | `result` | ✅ snake_case, `_total` suffix |
| `nodejs_*` | Various | (default) | ✅ `nodejs_` prefix for runtime metrics |

### Label naming

- All label names use `snake_case` ✅
- No camelCase or PascalCase labels found ✅

### Fix applied

- **`payroll_run_amount_usd`** — Added missing `env` label for consistency with other payroll metrics. Now: `payroll_run_amount_usd{env}`.

---

## 2. NestJS MetricsService Pattern Validation

### ✅ PASS — All patterns conform to NestJS + prom-client best practices

| Pattern | Implementation | Status |
| --- | --- | --- |
| **Dedicated Registry** | `readonly registry = new Registry()` (non-global) | ✅ Isolates metrics in tests |
| **Lifecycle hooks** | `OnModuleInit` / `OnModuleDestroy` | ✅ Proper cleanup |
| **Default metrics** | `collectDefaultMetrics({ prefix: 'nodejs_' })` | ✅ Alloy dashboards expect this prefix |
| **readonly fields** | All metric objects marked `readonly` | ✅ Prevents accidental reassignment |
| **Typed label names** | `['env'] as const` pattern | ✅ Compile-time label safety |
| **Convenience methods** | `increment*`, `start*Timer`, `observe*` | ✅ Clean service injection API |
| **Timer patterns** | Pre-set labels for domain timers; dynamic labels for HTTP | ✅ Correct usage |

### Minor inconsistency noted (non-blocking)

- `startHttpTimer()` returns a function that **requires** labels at call time.
- `startPayrollJpmcTimer()` and `startJpmApiTimer()` pre-set `operation` label and return a no-arg function.
- **Impact:** Low — different use cases (HTTP needs status_code after request; domain timers know operation upfront).

---

## 3. Alloy Scrape Configuration

### Deliverable: `nestjs-reference/alloy/alloy.river`

Complete production-ready Alloy configuration with:

| Feature | Implementation |
| --- | --- |
| **Scrape target** | `prometheus.scrape "nestjs_payroll_jpm"` with env var overrides |
| **Scrape interval** | 15s (production default), 5s (dev override via `SCRAPE_INTERVAL`) |
| **Labels** | `service=nestjs-payroll-jpm`, `env=${NODE_ENV}`, `platform=nestjs` |
| **Remote write** | `prometheus.remote_write "default"` with queue_config for high throughput |
| **Auth options** | Basic auth (default) + bearer token (commented) |
| **Health server** | Internal HTTP server on :9090 for Alloy /ready and /metrics |
| **Relabeling** | Optional `add_env_label` rule for constant environment tagging |

### Environment variables

```bash
ALLOY_SCRAPE_HOST=localhost      # NestJS app host
ALLOY_SCRAPE_PORT=3000           # NestJS metrics port
PROMETHEUS_RW_URL=https://...    # Grafana Cloud or self-hosted Prometheus
PROMETHEUS_RW_USER=12345         # Grafana Cloud instance ID
PROMETHEUS_RW_PASS=glc_...       # Grafana Cloud API key
```

### Validation command

```bash
alloy run --config=./alloy.river
```

---

## 4. HTTP Metrics Interceptor Audit

### ✅ PASS — `HttpMetricsInterceptor` correctly instruments all HTTP requests

| Check | Description | Status |
| --- | --- | --- |
| **Route cardinality protection** | Uses `request.route?.path` (Express pattern) not `request.url` | ✅ Prevents label explosion |
| **Context type guard** | Skips non-HTTP contexts (`context.getType() !== 'http'`) | ✅ Safe for WebSocket/gRPC |
| **Timer lifecycle** | `startTimer()` before handler, `endTimer()` in `tap`/`catchError` | ✅ Correct RxJS pattern |
| **Error handling** | Records 500 default in catchError; AllExceptionsFilter records actual status | ✅ Dual-path coverage |
| **Label consistency** | `method`, `route`, `status_code` match MetricsService definition | ✅ |

---

## 5. MetricsController Audit

### ✅ PASS — Scrape endpoint correctly implemented

| Check | Description | Status |
| --- | --- | --- |
| **Content-Type** | Dynamically from `registry.contentType` | ✅ Correct Prometheus negotiation |
| **Response format** | `res.end(body)` (raw text exposition) | ✅ No JSON wrapping |
| **Async handling** | `async/await` with `Promise.all` | ✅ Non-blocking |
| **Security note** | Documented (network policy / bearer guard / separate port) | ✅ |

---

## Summary

| Category | Result |
| --- | --- |
| Metric naming consistency | ✅ PASS (1 fix applied) |
| NestJS service patterns | ✅ PASS |
| Alloy scrape config | ✅ Delivered |
| HTTP interceptor | ✅ PASS |
| Metrics controller | ✅ PASS |

**All services correctly expose Prometheus metrics for Grafana Alloy scraping.**
