#!/usr/bin/env bash
# =============================================================================
# deploy-check.sh — Deployment readiness checker for NestJS Payroll + JPM
#
# Usage:
#   ./scripts/deploy-check.sh <service-name> <check>
#
# <check> options:
#   env      — Validate required environment variables
#   metrics  — Prometheus /metrics smoke test
#   alloy    — Grafana Alloy remote_write connectivity
#   grafana  — Grafana dashboard panel data validation
#   all      — Run all four checks in sequence
#
# Exit codes:
#   0  — All requested checks passed
#   1  — One or more checks failed
#
# Environment variables consumed by this script:
#   SERVICE_HOST   — Hostname/IP of the running service  (default: localhost)
#   SERVICE_PORT   — Port of the running service         (default: 3000)
#   ALLOY_HOST     — Hostname/IP of Grafana Alloy        (default: localhost)
#   ALLOY_PORT     — Alloy HTTP port                     (default: 12345)
#   GRAFANA_URL    — Grafana base URL                    (default: http://localhost:3001)
#   GRAFANA_TOKEN  — Grafana service-account API token   (optional — skips panel check if absent)
#   GRAFANA_DASHBOARD_UID — UID of the dashboard to validate (default: nestjs-payroll-jpm)
# =============================================================================

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

pass()  { echo -e "  ${GREEN}✓${RESET}  $*"; }
fail()  { echo -e "  ${RED}✗${RESET}  $*"; FAILURES=$((FAILURES + 1)); }
warn()  { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
info()  { echo -e "  ${CYAN}→${RESET}  $*"; }
header(){ echo -e "\n${BOLD}${CYAN}══ $* ══${RESET}"; }

FAILURES=0

# ── Args ───────────────────────────────────────────────────────────────────────
SERVICE_NAME="${1:-<service-name>}"
CHECK="${2:-all}"

SERVICE_HOST="${SERVICE_HOST:-localhost}"
SERVICE_PORT="${SERVICE_PORT:-3000}"
ALLOY_HOST="${ALLOY_HOST:-localhost}"
ALLOY_PORT="${ALLOY_PORT:-12345}"
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3001}"
GRAFANA_TOKEN="${GRAFANA_TOKEN:-}"
GRAFANA_DASHBOARD_UID="${GRAFANA_DASHBOARD_UID:-nestjs-payroll-jpm}"

METRICS_URL="http://${SERVICE_HOST}:${SERVICE_PORT}/metrics"
ALLOY_READY_URL="http://${ALLOY_HOST}:${ALLOY_PORT}/ready"
ALLOY_METRICS_URL="http://${ALLOY_HOST}:${ALLOY_PORT}/metrics"

echo -e "\n${BOLD}Deployment Check — ${SERVICE_NAME}${RESET}"
echo    "  Service : ${SERVICE_HOST}:${SERVICE_PORT}"
echo    "  Alloy   : ${ALLOY_HOST}:${ALLOY_PORT}"
echo    "  Grafana : ${GRAFANA_URL}"
echo    "  Check   : ${CHECK}"

# =============================================================================
# 1 — Environment variables
# =============================================================================
check_env() {
  header "1 — Environment Variables"

  local required_vars=(
    JPMORGAN_ENV
    NODE_ENV
  )

  # At least one of these auth strategies must be configured
  local auth_jpmorgan_token="${JPMORGAN_ACCESS_TOKEN:-}"
  local auth_client_id="${JPMC_CLIENT_ID:-}"

  local optional_vars=(
    JPMC_BASE_URL
    JPMC_ACH_DEBIT_ACCOUNT
    JPMC_ACH_COMPANY_ID
    SIGNING_KEY_PATH
    JPM_PUBLIC_KEY_PATH
    JPM_CALLBACK_CERT_PATH
    MTLS_CLIENT_CERT_PATH
    MTLS_CLIENT_KEY_PATH
    MTLS_CA_BUNDLE_PATH
    METRICS_PORT
    PROMETHEUS_REMOTE_WRITE_URL
  )

  for var in "${required_vars[@]}"; do
    if [[ -n "${!var:-}" ]]; then
      pass "${var} is set"
    else
      fail "${var} is NOT set (required)"
    fi
  done

  # Auth strategy check
  if [[ -n "${auth_jpmorgan_token}" ]]; then
    pass "JPMORGAN_ACCESS_TOKEN is set (Bearer token auth)"
  elif [[ -n "${auth_client_id}" && -n "${JPMC_CLIENT_SECRET:-}" && -n "${JPMC_TOKEN_URL:-}" ]]; then
    pass "JPMC_CLIENT_ID / JPMC_CLIENT_SECRET / JPMC_TOKEN_URL are set (client-credentials auth)"
  else
    fail "No JPM auth configured — set JPMORGAN_ACCESS_TOKEN or JPMC_CLIENT_ID+JPMC_CLIENT_SECRET+JPMC_TOKEN_URL"
  fi

  # Optional vars — warn only
  for var in "${optional_vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
      warn "${var} is not set (optional)"
    fi
  done

  # Cert file existence checks (only if paths are set)
  local cert_vars=(SIGNING_KEY_PATH JPM_PUBLIC_KEY_PATH JPM_CALLBACK_CERT_PATH MTLS_CLIENT_CERT_PATH MTLS_CLIENT_KEY_PATH MTLS_CA_BUNDLE_PATH)
  for var in "${cert_vars[@]}"; do
    local path="${!var:-}"
    if [[ -n "${path}" ]]; then
      if [[ -f "${path}" ]]; then
        pass "Cert file exists: ${path}"
      else
        fail "Cert file NOT found: ${path} (${var})"
      fi
    fi
  done
}

# =============================================================================
# 2 — Prometheus metrics smoke test
# =============================================================================
check_metrics() {
  header "2 — Prometheus Metrics Smoke Test"

  info "GET ${METRICS_URL}"

  local body
  local http_code
  http_code=$(curl -s -o /tmp/deploy_check_metrics.txt -w "%{http_code}" --max-time 10 "${METRICS_URL}" 2>/dev/null || echo "000")

  if [[ "${http_code}" == "200" ]]; then
    pass "/metrics returned HTTP 200"
  else
    fail "/metrics returned HTTP ${http_code} (expected 200)"
    return
  fi

  body=$(cat /tmp/deploy_check_metrics.txt)

  # Required metric families
  local required_metrics=(
    "http_requests_total"
    "http_request_duration_seconds"
    "http_errors_total"
    "payroll_runs_created_total"
    "payroll_runs_approved_total"
    "payroll_runs_submitted_total"
    "payroll_run_amount_usd"
    "payroll_payments_total"
    "payroll_jpmc_api_duration_seconds"
    "jpm_api_calls_total"
    "jpm_api_duration_seconds"
    "jpm_callback_verifications_total"
  )

  for metric in "${required_metrics[@]}"; do
    if echo "${body}" | grep -q "^# HELP ${metric}"; then
      pass "Metric family present: ${metric}"
    else
      fail "Metric family MISSING: ${metric}"
    fi
  done

  # Content-type check
  local content_type
  content_type=$(curl -s -I --max-time 5 "${METRICS_URL}" 2>/dev/null | grep -i "^content-type:" | tr -d '\r' || echo "")
  if echo "${content_type}" | grep -qi "text/plain"; then
    pass "Content-Type is text/plain (Prometheus exposition format)"
  else
    warn "Content-Type may not be text/plain: ${content_type}"
  fi
}

# =============================================================================
# 3 — Grafana Alloy remote_write connectivity
# =============================================================================
check_alloy() {
  header "3 — Grafana Alloy remote_write Connectivity"

  # 3a — Alloy /ready endpoint
  info "GET ${ALLOY_READY_URL}"
  local ready_code
  ready_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${ALLOY_READY_URL}" 2>/dev/null || echo "000")

  if [[ "${ready_code}" == "200" ]]; then
    pass "Alloy /ready returned HTTP 200"
  else
    fail "Alloy /ready returned HTTP ${ready_code} — is Alloy running at ${ALLOY_HOST}:${ALLOY_PORT}?"
    return
  fi

  # 3b — Alloy self-metrics: check for remote_write send errors
  info "Checking Alloy self-metrics for remote_write errors"
  local alloy_metrics
  alloy_metrics=$(curl -s --max-time 10 "${ALLOY_METRICS_URL}" 2>/dev/null || echo "")

  if [[ -z "${alloy_metrics}" ]]; then
    warn "Could not fetch Alloy self-metrics from ${ALLOY_METRICS_URL}"
  else
    # prometheus_remote_write_samples_failed_total should be 0 or absent
    local failed_total
    failed_total=$(echo "${alloy_metrics}" | grep "^prometheus_remote_write_samples_failed_total" | awk '{print $2}' | head -1 || echo "0")
    failed_total="${failed_total:-0}"

    if [[ "${failed_total}" == "0" ]] || [[ -z "${failed_total}" ]]; then
      pass "prometheus_remote_write_samples_failed_total = 0 (no send failures)"
    else
      fail "prometheus_remote_write_samples_failed_total = ${failed_total} (remote_write failures detected)"
    fi

    # Check that Alloy is successfully scraping our service
    local scrape_duration
    scrape_duration=$(echo "${alloy_metrics}" | grep "scrape_duration_seconds" | head -1 || echo "")
    if [[ -n "${scrape_duration}" ]]; then
      pass "Alloy scrape_duration_seconds metric present (scraping is active)"
    else
      warn "scrape_duration_seconds not found in Alloy metrics — scrape job may not be configured yet"
    fi
  fi

  # 3c — remote_write URL reachability (if configured)
  if [[ -n "${PROMETHEUS_REMOTE_WRITE_URL:-}" ]]; then
    info "Checking remote_write endpoint reachability: ${PROMETHEUS_REMOTE_WRITE_URL}"
    local rw_code
    rw_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${PROMETHEUS_REMOTE_WRITE_URL}" 2>/dev/null || echo "000")
    # 405 Method Not Allowed is acceptable (endpoint exists but rejects GET)
    if [[ "${rw_code}" == "200" || "${rw_code}" == "204" || "${rw_code}" == "405" ]]; then
      pass "remote_write endpoint reachable (HTTP ${rw_code})"
    else
      fail "remote_write endpoint returned HTTP ${rw_code} — check PROMETHEUS_REMOTE_WRITE_URL"
    fi
  else
    warn "PROMETHEUS_REMOTE_WRITE_URL not set — skipping remote_write endpoint reachability check"
  fi
}

# =============================================================================
# 4 — Grafana dashboard panel validation
# =============================================================================
check_grafana() {
  header "4 — Grafana Dashboard Panel Validation"

  if [[ -z "${GRAFANA_TOKEN}" ]]; then
    warn "GRAFANA_TOKEN not set — skipping automated panel check"
    info "Manual steps:"
    info "  1. Open ${GRAFANA_URL}/d/${GRAFANA_DASHBOARD_UID}"
    info "  2. Set time range to Last 15 minutes"
    info "  3. Confirm no panels show 'No data' or 'Error executing query'"
    return
  fi

  # 4a — Grafana health check
  info "GET ${GRAFANA_URL}/api/health"
  local health_code
  health_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -H "Authorization: Bearer ${GRAFANA_TOKEN}" \
    "${GRAFANA_URL}/api/health" 2>/dev/null || echo "000")

  if [[ "${health_code}" == "200" ]]; then
    pass "Grafana /api/health returned HTTP 200"
  else
    fail "Grafana /api/health returned HTTP ${health_code} — check GRAFANA_URL and GRAFANA_TOKEN"
    return
  fi

  # 4b — Dashboard existence check
  info "GET ${GRAFANA_URL}/api/dashboards/uid/${GRAFANA_DASHBOARD_UID}"
  local dash_response
  dash_response=$(curl -s --max-time 10 \
    -H "Authorization: Bearer ${GRAFANA_TOKEN}" \
    "${GRAFANA_URL}/api/dashboards/uid/${GRAFANA_DASHBOARD_UID}" 2>/dev/null || echo "")

  if echo "${dash_response}" | grep -q '"uid"'; then
    pass "Dashboard '${GRAFANA_DASHBOARD_UID}' found in Grafana"
  else
    fail "Dashboard '${GRAFANA_DASHBOARD_UID}' NOT found — check GRAFANA_DASHBOARD_UID"
    return
  fi

  # 4c — Instant query smoke tests for key panels
  local now
  now=$(date +%s)
  local queries=(
    "rate(http_requests_total[5m])"
    "rate(http_errors_total[5m])"
    "increase(payroll_runs_created_total[1h])"
    "increase(payroll_runs_approved_total[1h])"
    "rate(jpm_api_calls_total[5m])"
  )

  info "Running instant PromQL queries via Grafana proxy"
  for query in "${queries[@]}"; do
    local encoded_query
    encoded_query=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "${query}" 2>/dev/null \
      || echo "${query}" | sed 's/ /%20/g; s/\[/%5B/g; s/\]/%5D/g; s/(/%28/g; s/)/%29/g')

    local qr_code
    qr_code=$(curl -s -o /tmp/deploy_check_grafana_query.txt -w "%{http_code}" --max-time 15 \
      -H "Authorization: Bearer ${GRAFANA_TOKEN}" \
      "${GRAFANA_URL}/api/datasources/proxy/1/api/v1/query?query=${encoded_query}&time=${now}" \
      2>/dev/null || echo "000")

    if [[ "${qr_code}" == "200" ]]; then
      local status
      status=$(grep -o '"status":"[^"]*"' /tmp/deploy_check_grafana_query.txt | head -1 | cut -d'"' -f4 || echo "unknown")
      if [[ "${status}" == "success" ]]; then
        pass "Query OK: ${query}"
      else
        fail "Query returned status='${status}': ${query}"
      fi
    else
      warn "Query HTTP ${qr_code} (datasource proxy may need UID — check manually): ${query}"
    fi
  done
}

# =============================================================================
# Main
# =============================================================================
case "${CHECK}" in
  env)     check_env ;;
  metrics) check_metrics ;;
  alloy)   check_alloy ;;
  grafana) check_grafana ;;
  all)
    check_env
    check_metrics
    check_alloy
    check_grafana
    ;;
  *)
    echo "Unknown check: ${CHECK}"
    echo "Usage: $0 <service-name> [env|metrics|alloy|grafana|all]"
    exit 1
    ;;
esac

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [[ "${FAILURES}" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}All checks passed for '${SERVICE_NAME}'.${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}${FAILURES} check(s) FAILED for '${SERVICE_NAME}'. See output above.${RESET}"
  exit 1
fi
