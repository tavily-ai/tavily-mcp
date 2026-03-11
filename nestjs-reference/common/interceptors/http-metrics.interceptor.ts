// @ts-nocheck
/**
 * HttpMetricsInterceptor — NestJS interceptor that records Prometheus HTTP metrics.
 *
 * Registered globally via MetricsModule (APP_INTERCEPTOR token) so every
 * inbound HTTP request is instrumented automatically, regardless of which
 * module handles it.
 *
 * Metrics recorded per request:
 *   http_requests_total{method, route, status_code}           Counter
 *   http_request_duration_seconds{method, route, status_code} Histogram
 *
 * Route normalisation:
 *   Uses `request.route.path` (the Express route pattern, e.g. '/payroll/runs/:id')
 *   rather than `request.url` (the concrete URL, e.g. '/payroll/runs/abc-123').
 *   This prevents high-cardinality label explosion in Prometheus.
 *
 * Required npm packages:
 *   @nestjs/common  (already a NestJS dependency)
 *   prom-client     (via MetricsService)
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import type { Request, Response } from 'express';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Only instrument HTTP contexts (skip WebSocket, gRPC, etc.)
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request  = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const method   = request.method ?? 'UNKNOWN';

    // Start the latency timer before the handler runs.
    const endTimer = this.metrics.startHttpTimer();

    return next.handle().pipe(
      tap(() => {
        // Success path — record with the actual HTTP status code.
        const route      = request.route?.path ?? request.path ?? 'unknown';
        const statusCode = String(response.statusCode ?? 200);

        endTimer({ method, route, status_code: statusCode });
        this.metrics.incrementHttpRequests(method, route, statusCode);
      }),
      catchError((err) => {
        // Error path — the AllExceptionsFilter will set the final status code,
        // but we still need to stop the timer.  Use 500 as a safe default;
        // AllExceptionsFilter increments http_errors_total with the real code.
        const route      = request.route?.path ?? request.path ?? 'unknown';
        const statusCode = err?.status ? String(err.status) : '500';

        endTimer({ method, route, status_code: statusCode });
        this.metrics.incrementHttpRequests(method, route, statusCode);

        return throwError(() => err);
      }),
    );
  }
}
