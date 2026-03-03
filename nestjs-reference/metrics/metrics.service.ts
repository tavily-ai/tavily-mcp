// @ts-nocheck
/**
 * MetricsService — Prometheus metrics registry for Grafana Alloy scraping.
 *
 * Uses `prom-client` directly (no wrapper library) so the output is 100%
 * compatible with the OpenMetrics / Prometheus exposition format that
 * Grafana Alloy expects.
 *
 * All metrics are registered on a dedicated Registry (not the global default)
 * to avoid conflicts when multiple NestJS modules are loaded in the same
 * process (e.g. during testing).
 *
 * Metric catalogue
 * ────────────────
 * HTTP layer
 *   http_requests_total{method,route,status_code}          Counter
 *   http_request_duration_seconds{method,route,status_code} Histogram
 *   http_errors_total{method,route,status_code}            Counter
 *
 * Payroll domain
 *   payroll_runs_created_total{env}                        Counter
 *   payroll_runs_approved_total{env}                       Counter
 *   payroll_runs_submitted_total{status,env}               Counter
 *   payroll_run_amount_usd                                 Histogram
 *   payroll_payments_total{status,env}                     Counter
 *   payroll_jpmc_api_duration_seconds{operation}           Histogram
 *
 * JPM API layer
 *   jpm_api_calls_total{operation,status}                  Counter
 *   jpm_api_duration_seconds{operation}                    Histogram
 *   jpm_callback_verifications_total{result}               Counter
 *
 * Required npm packages (add to your NestJS project):
 *   npm install prom-client
 *
 * Usage:
 *   constructor(private readonly metrics: MetricsService) {}
 *
 *   // Record a payroll run creation
 *   this.metrics.incrementPayrollRunsCreated();
 *
 *   // Time a JPMC API call
 *   const end = this.metrics.startJpmcApiTimer('createAchPayment');
 *   await jpmcClient.createAchPayment(...);
 *   end({ operation: 'createAchPayment' });
 */

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

// ─── Environment label helper ─────────────────────────────────────────────────

function envLabel(): string {
  return process.env.JPMORGAN_PAYMENTS_ENV
    ?? process.env.JPMORGAN_ENV
    ?? process.env.NODE_ENV
    ?? 'unknown';
}

// ─── Histogram bucket presets ─────────────────────────────────────────────────

/** Standard HTTP latency buckets (seconds). */
const HTTP_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/** External API latency buckets — wider range for JPMC network calls. */
const API_DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30];

/** Payroll run amount buckets in USD. */
const AMOUNT_BUCKETS = [100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000];

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);

  /** Dedicated registry — avoids global singleton conflicts in tests. */
  readonly registry = new Registry();

  // ── HTTP layer ─────────────────────────────────────────────────────────────

  readonly httpRequestsTotal = new Counter({
    name:       'http_requests_total',
    help:       'Total number of HTTP requests received.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers:  [this.registry],
  });

  readonly httpRequestDurationSeconds = new Histogram({
    name:       'http_request_duration_seconds',
    help:       'HTTP request latency in seconds.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets:    HTTP_DURATION_BUCKETS,
    registers:  [this.registry],
  });

  readonly httpErrorsTotal = new Counter({
    name:       'http_errors_total',
    help:       'Total number of HTTP errors (4xx + 5xx) returned.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers:  [this.registry],
  });

  // ── Payroll domain ─────────────────────────────────────────────────────────

  readonly payrollRunsCreatedTotal = new Counter({
    name:       'payroll_runs_created_total',
    help:       'Total number of payroll runs created (DRAFT status).',
    labelNames: ['env'] as const,
    registers:  [this.registry],
  });

  readonly payrollRunsApprovedTotal = new Counter({
    name:       'payroll_runs_approved_total',
    help:       'Total number of payroll runs approved by a checker.',
    labelNames: ['env'] as const,
    registers:  [this.registry],
  });

  readonly payrollRunsSubmittedTotal = new Counter({
    name:       'payroll_runs_submitted_total',
    help:       'Total number of payroll runs submitted to JPMorgan (success or failure).',
    labelNames: ['status', 'env'] as const,
    registers:  [this.registry],
  });

  readonly payrollRunAmountUsd = new Histogram({
    name:      'payroll_run_amount_usd',
    help:      'Distribution of total payroll run amounts in USD.',
    buckets:   AMOUNT_BUCKETS,
    registers: [this.registry],
  });

  readonly payrollPaymentsTotal = new Counter({
    name:       'payroll_payments_total',
    help:       'Total number of individual payroll payments by final JPMC status.',
    labelNames: ['status', 'env'] as const,
    registers:  [this.registry],
  });

  readonly payrollJpmcApiDurationSeconds = new Histogram({
    name:       'payroll_jpmc_api_duration_seconds',
    help:       'Latency of JPMC API calls made during payroll submission.',
    labelNames: ['operation'] as const,
    buckets:    API_DURATION_BUCKETS,
    registers:  [this.registry],
  });

  // ── JPM API layer ──────────────────────────────────────────────────────────

  readonly jpmApiCallsTotal = new Counter({
    name:       'jpm_api_calls_total',
    help:       'Total number of outbound JPM API calls.',
    labelNames: ['operation', 'status'] as const,
    registers:  [this.registry],
  });

  readonly jpmApiDurationSeconds = new Histogram({
    name:       'jpm_api_duration_seconds',
    help:       'Latency of outbound JPM API calls in seconds.',
    labelNames: ['operation'] as const,
    buckets:    API_DURATION_BUCKETS,
    registers:  [this.registry],
  });

  readonly jpmCallbackVerificationsTotal = new Counter({
    name:       'jpm_callback_verifications_total',
    help:       'Total number of inbound JPM webhook signature verifications.',
    labelNames: ['result'] as const,
    registers:  [this.registry],
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onModuleInit(): void {
    // Collect Node.js default metrics (heap, GC, event loop lag, etc.)
    // prefixed with 'nodejs_' — Alloy dashboards expect these.
    collectDefaultMetrics({ register: this.registry, prefix: 'nodejs_' });
    this.logger.log('Prometheus metrics registry initialised.');
  }

  onModuleDestroy(): void {
    this.registry.clear();
  }

  // ── Convenience methods ────────────────────────────────────────────────────

  /** Increment http_requests_total. */
  incrementHttpRequests(method: string, route: string, statusCode: string): void {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode });
  }

  /** Increment http_errors_total. */
  incrementHttpErrors(method: string, route: string, statusCode: string): void {
    this.httpErrorsTotal.inc({ method, route, status_code: statusCode });
  }

  /**
   * Start an HTTP request duration timer.
   * Call the returned function with labels when the request completes.
   *
   * @example
   *   const end = this.metrics.startHttpTimer();
   *   // ... handle request ...
   *   end({ method: 'POST', route: '/payroll/runs', status_code: '201' });
   */
  startHttpTimer(): (labels: { method: string; route: string; status_code: string }) => void {
    return this.httpRequestDurationSeconds.startTimer();
  }

  /** Increment payroll_runs_created_total. */
  incrementPayrollRunsCreated(): void {
    this.payrollRunsCreatedTotal.inc({ env: envLabel() });
  }

  /** Increment payroll_runs_approved_total. */
  incrementPayrollRunsApproved(): void {
    this.payrollRunsApprovedTotal.inc({ env: envLabel() });
  }

  /** Increment payroll_runs_submitted_total with a success/failure status. */
  incrementPayrollRunsSubmitted(status: 'success' | 'failure'): void {
    this.payrollRunsSubmittedTotal.inc({ status, env: envLabel() });
  }

  /** Record a payroll run total amount in the histogram. */
  observePayrollRunAmount(amountUsd: number): void {
    this.payrollRunAmountUsd.observe(amountUsd);
  }

  /** Increment payroll_payments_total for a given JPMC payment status. */
  incrementPayrollPayments(jpmcStatus: string): void {
    this.payrollPaymentsTotal.inc({ status: jpmcStatus, env: envLabel() });
  }

  /**
   * Start a JPMC API call timer for payroll operations.
   * Returns a function to call when the operation completes.
   *
   * @example
   *   const end = this.metrics.startPayrollJpmcTimer('createAchPayment');
   *   await jpmcClient.createAchPayment(...);
   *   end();
   */
  startPayrollJpmcTimer(operation: string): () => void {
    const end = this.payrollJpmcApiDurationSeconds.startTimer({ operation });
    return end;
  }

  /** Increment jpm_api_calls_total. */
  incrementJpmApiCalls(operation: string, status: 'success' | 'failure'): void {
    this.jpmApiCallsTotal.inc({ operation, status });
  }

  /**
   * Start a JPM API call duration timer.
   * Returns a function to call when the operation completes.
   */
  startJpmApiTimer(operation: string): () => void {
    return this.jpmApiDurationSeconds.startTimer({ operation });
  }

  /** Increment jpm_callback_verifications_total. */
  incrementJpmCallbackVerification(result: 'valid' | 'invalid'): void {
    this.jpmCallbackVerificationsTotal.inc({ result });
  }

  /**
   * Render all metrics in Prometheus text exposition format.
   * Called by MetricsController GET /metrics.
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /** Returns the Content-Type header value for the Prometheus scrape response. */
  getContentType(): string {
    return this.registry.contentType;
  }
}
