# Grafana Dashboards Skill

## Description
Create and configure Grafana dashboards for monitoring NestJS applications with Prometheus metrics.

## When to Use
- Setting up new service monitoring
- Creating business KPI dashboards
- Building operational runbooks
- Configuring alerts

## Prerequisites
- Prometheus metrics exposed at `/metrics`
- Grafana Alloy configured to scrape metrics
- Grafana instance (local or cloud)

## Steps

### 1. Define Dashboard Requirements
Identify what needs monitoring:
- HTTP request rates and latencies
- Business operation metrics (payments, payroll runs)
- Error rates and status codes
- Resource utilization (if available)
- Custom business KPIs

### 2. Create Dashboard JSON
```json
{
  "dashboard": {
    "title": "<Service> Overview",
    "tags": ["nestjs", "<service>"],
    "timezone": "browser",
    "panels": [
      {
        "title": "Request Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{job=\"<service>\"}[5m]))",
            "legendFormat": "Requests/sec"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_errors_total{job=\"<service>\"}[5m])) / sum(rate(http_requests_total{job=\"<service>\"}[5m]))",
            "legendFormat": "Error %"
          }
        ]
      },
      {
        "title": "Response Time (p95)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job=\"<service>\"}[5m])) by (le))",
            "legendFormat": "p95"
          }
        ]
      }
    ]
  }
}
```

### 3. Add Business Metrics Panels
```json
{
  "title": "Payments Processed",
  "type": "stat",
  "targets": [
    {
      "expr": "sum(payroll_payments_total{status=\"completed\"})",
      "legendFormat": "Total Payments"
    }
  ]
}
```

### 4. Configure Alerts (Optional)
```yaml
# In Alloy or Grafana Alerting
alerting:
  rules:
    - alert: HighErrorRate
      expr: sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m])) > 0.05
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High error rate detected"
```

### 5. Document Dashboard
Add to `nestjs-reference/README.md`:
```markdown
## Monitoring

### Grafana Dashboards
- **Service Overview**: Request rates, error rates, latency
- **Business Metrics**: Payment volumes, payroll runs
- **Infrastructure**: (if applicable)

### Key Metrics
| Metric | Query | Threshold |
|--------|-------|-----------|
| Error Rate | `http_errors_total / http_requests_total` | < 5% |
| p95 Latency | `histogram_quantile(0.95, ...)` | < 500ms |
```

## Common PromQL Queries

### HTTP Metrics
```promql
# Request rate by route
sum(rate(http_requests_total[5m])) by (route)

# Error rate
sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m]))

# p99 latency
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

### Business Metrics
```promql
# Total payments by status
sum(payroll_payments_total) by (status)

# Payroll runs created today
increase(payroll_runs_created_total[24h])

# Average payment amount
avg(payroll_run_amount_usd_bucket)
```

### JPMorgan API Metrics
```promql
# API call rate
sum(rate(jpm_api_calls_total[5m])) by (operation)

# API error rate
sum(rate(jpm_api_calls_total{status=\"error\"}[5m])) / sum(rate(jpm_api_calls_total[5m]))

# API latency
histogram_quantile(0.95, sum(rate(jpm_api_duration_seconds_bucket[5m])) by (le, operation))
```

## Output
- Dashboard JSON file in `grafana/dashboards/`
- Documentation in README
- Alert rules (if configured)

## References
- `nestjs-reference/metrics/metrics.service.ts` - Available metrics
- `nestjs-reference/alloy/alloy.river` - Scraping configuration
- `nestjs-reference/METRICS_AGENT_REPORT.md` - Metrics documentation

