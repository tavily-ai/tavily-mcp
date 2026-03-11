# Deployment Checklist

Use this prompt to validate a deployment-ready state for the Tavily MCP server or NestJS reference implementation.

## Input
Service or module to deploy: `<service-name>`
Environment: `<testing|production>`

## Pre-Deployment Validation

### 1. Environment Variables
- [ ] All required API keys are set (`TAVILY_API_KEY`, `STRIPE_SECRET_KEY`, etc.)
- [ ] JPMorgan certificates are in place (`/certs/uat/` or `/certs/prod/`)
- [ ] OAuth credentials configured (`JPMC_CLIENT_ID`, `JPMC_CLIENT_SECRET`)
- [ ] Environment variable `NODE_ENV` matches target environment

### 2. Security Checks
- [ ] No hardcoded secrets in source code
- [ ] PII masking functions are imported and used
- [ ] Audit logging is enabled for financial operations
- [ ] mTLS certificates are valid and not expired

### 3. Metrics & Observability
- [ ] Prometheus metrics endpoint returns 200 at `/metrics`
- [ ] All expected metrics are present:
  - `http_requests_total`
  - `http_request_duration_seconds`
  - `payroll_runs_created_total` (if payroll enabled)
  - `jpm_api_calls_total` (if JPM enabled)
- [ ] Grafana Alloy configuration is valid (check `alloy/alloy.river`)
- [ ] Log aggregation is configured (Loki/Alloy)

### 4. Integration Tests
- [ ] Run `test_critical_path.mjs` - all tests pass
- [ ] Run `test_payroll_critical.mjs` - payroll flow works
- [ ] Run `test_signing_critical.mjs` - JPM signing works
- [ ] Run `nestjs-test/tests/di-wiring.spec.ts` - NestJS DI valid

### 5. Database/State Checks (if applicable)
- [ ] Database migrations are up to date
- [ ] Payroll run models are compatible
- [ ] No pending TODO items in `TODO_<FEATURE>.md`

### 6. Documentation
- [ ] `README.md` is updated with any new environment variables
- [ ] `DEPLOYMENT_CHECKLIST.md` is reviewed
- [ ] `METRICS_AGENT_REPORT.md` is current

## Post-Deployment Verification

### 7. Smoke Tests
- [ ] Health check endpoint returns 200
- [ ] MCP tools are registered and responding
- [ ] Stripe payment intent creation works (test mode)
- [ ] JPMorgan balance retrieval works (if configured)

### 8. Monitoring
- [ ] First metrics appear in Prometheus/Grafana within 5 minutes
- [ ] Audit logs are flowing to log aggregator
- [ ] Error rate is below 1%

## Rollback Plan
- [ ] Previous version is tagged and can be restored
- [ ] Database backups are current (if applicable)
- [ ] Environment variables can be quickly reverted

## Sign-off
- [ ] Security review completed
- [ ] Compliance team approval (for production)
- [ ] Operations team notified

