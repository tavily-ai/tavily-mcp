# Deployment Checklist — NestJS Payroll + JPM Service

Run this checklist for every deployment to staging and production.
Replace `<service-name>` with the actual service identifier (e.g. `payroll-api`, `jpm-gateway`).

---

## 1 — Validate Environment Variables

All variables must be set and non-empty before the process starts.

### Required — J.P. Morgan API

| Variable | Description |
| --- | --- |
| `JPMORGAN_ACCESS_TOKEN` | OAuth Bearer token (or use client-credentials below) |
| `JPMC_CLIENT_ID` | OAuth client ID for `JpmcCorporateQuickPayClient` |
| `JPMC_CLIENT_SECRET` | OAuth client secret |
| `JPMC_TOKEN_URL` | OAuth token endpoint |
| `JPMC_BASE_URL` | API base URL (default: `https://api-sandbox.jpmorgan.com`) |
| `JPMORGAN_ENV` | `testing` or `production` |

### Required — Payroll ACH

| Variable | Description |
| --- | --- |
| `JPMC_ACH_DEBIT_ACCOUNT` | Operating account ID for ACH debits |
| `JPMC_ACH_COMPANY_ID` | ACH company ID |

### Required — Observability

| Variable | Description |
| --- | --- |
| `METRICS_PORT` | Port for `/metrics` scrape endpoint (default: `3000`) |
| `NODE_ENV` | `production` / `staging` / `development` |

### Optional — Certificate overrides

| Variable | Description |
| --- | --- |
| `SIGNING_KEY_PATH` | RSA private key for request signing |
| `JPM_PUBLIC_KEY_PATH` | JPM RSA public key for payload encryption |
| `JPM_CALLBACK_CERT_PATH` | JPM certificate for callback verification |
| `MTLS_CLIENT_CERT_PATH` | mTLS client certificate |
| `MTLS_CLIENT_KEY_PATH` | mTLS client private key |
| `MTLS_CA_BUNDLE_PATH` | JPM CA bundle for mTLS |

**Automated check:**

```bash
./scripts/deploy-check.sh <service-name> env
```

---

## 2 — Prometheus Metrics Smoke Test

After the service starts, verify the `/metrics` endpoint returns the expected metric families.

**Expected metric names (minimum set):**

```text
# HELP http_requests_total
# HELP http_request_duration_seconds
# HELP http_errors_total
# HELP payroll_runs_created_total
# HELP payroll_runs_approved_total
# HELP payroll_runs_submitted_total
# HELP payroll_run_amount_usd
# HELP payroll_payments_total
# HELP payroll_jpmc_api_duration_seconds
# HELP jpm_api_calls_total
# HELP jpm_api_duration_seconds
# HELP jpm_callback_verifications_total
```

**Manual check:**

```bash
curl -s http://localhost:3000/metrics | grep "^# HELP"
```

**Automated check:**

```bash
./scripts/deploy-check.sh <service-name> metrics
```

---

## 3 — Grafana Alloy remote_write Connectivity

Verify that Grafana Alloy can scrape `/metrics` and forward to the remote_write endpoint.

### Alloy scrape config (reference)

```river
prometheus.scrape "<service-name>" {
  targets = [{ __address__ = "localhost:3000" }]
  forward_to = [prometheus.remote_write.default.receiver]
  scrape_interval = "15s"
  metrics_path    = "/metrics"
}

prometheus.remote_write "default" {
  endpoint {
    url = env("PROMETHEUS_REMOTE_WRITE_URL")
    basic_auth {
      username = env("PROMETHEUS_REMOTE_WRITE_USER")
      password = env("PROMETHEUS_REMOTE_WRITE_PASSWORD")
    }
  }
}
```

### Checks

- [ ] Alloy process is running: `systemctl status alloy` or `docker ps | grep alloy`
- [ ] Alloy can reach the service scrape target (no `context deadline exceeded` in Alloy logs)
- [ ] Alloy remote_write endpoint responds 204: check Alloy logs for `component="prometheus.remote_write"`
- [ ] Metrics appear in Grafana Explore within 2 scrape intervals (30 s)

**Automated check:**

```bash
./scripts/deploy-check.sh <service-name> alloy
```

---

## 4 — Validate Grafana Dashboard Panels

Open the **NestJS Payroll + JPM** dashboard in Grafana and confirm each panel has data.

### Panel checklist

| Panel | PromQL | Expected |
| --- | --- | --- |
| HTTP Request Rate | `rate(http_requests_total[5m])` | Non-zero after first request |
| HTTP P99 Latency | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))` | Value in seconds |
| HTTP Error Rate | `rate(http_errors_total[5m])` | 0 (no errors at startup) |
| Payroll Runs Created | `increase(payroll_runs_created_total[1h])` | ≥ 0 |
| Payroll Runs Approved | `increase(payroll_runs_approved_total[1h])` | ≥ 0 |
| Payroll Submission Success Rate | `rate(payroll_runs_submitted_total{status="success"}[5m])` | ≥ 0 |
| JPM API Call Rate | `rate(jpm_api_calls_total[5m])` | ≥ 0 |
| JPM API P99 Latency | `histogram_quantile(0.99, rate(jpm_api_duration_seconds_bucket[5m]))` | Value in seconds |
| JPM Callback Verifications | `increase(jpm_callback_verifications_total[1h])` | ≥ 0 |

### Steps

1. Navigate to Grafana → Dashboards → **NestJS Payroll + JPM**
2. Set time range to **Last 15 minutes**
3. Confirm no panels show **"No data"** (panels may show 0 — that is acceptable)
4. Confirm no panels show **"Error executing query"**
5. Send a test `POST /payroll/runs` request and verify `payroll_runs_created_total` increments within one scrape interval

**Automated check:**

```bash
./scripts/deploy-check.sh <service-name> grafana
```

---

## Quick-run all checks

```bash
./scripts/deploy-check.sh <service-name> all
```

Exit code 0 = all checks passed. Non-zero = at least one check failed (see output for details).

---

## Rollback criteria

Trigger an immediate rollback if any of the following are true after deployment:

- `/metrics` endpoint returns non-200 or empty body
- `http_errors_total` rate exceeds 1% of `http_requests_total` within 5 minutes
- Alloy remote_write shows persistent 5xx errors for > 2 minutes
- Any Grafana panel shows **"Error executing query"** for a metric that existed pre-deployment
