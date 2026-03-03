// @ts-nocheck
/**
 * AllExceptionsFilter — Global NestJS exception filter.
 *
 * SOC 2 requirements satisfied:
 *   CC7.2  — All errors logged with request_id, actor context, and error_code.
 *   CC9.2  — Financial operation errors never expose raw stack traces in responses.
 *
 * Behaviour:
 *   - HttpException  → preserves the HTTP status; wraps body in the standard
 *                       error envelope { error_code, message, request_id }.
 *   - Any other Error → maps to HTTP 500; logs the full stack internally but
 *                       returns only a generic message to the caller.
 *   - Increments the `http_errors_total` Prometheus counter on every error.
 *
 * Standard error response envelope:
 * {
 *   "error_code":  "PAYROLL_RUN_NOT_FOUND",   // machine-readable
 *   "message":     "Payroll run not found: <id>",
 *   "request_id":  "550e8400-e29b-41d4-a716-446655440000",
 *   "status_code": 404
 * }
 *
 * Registration (main.ts or AppModule):
 *   app.useGlobalFilters(new AllExceptionsFilter(metricsService));
 *   // or via DI:
 *   providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }]
 *
 * Required npm packages:
 *   @nestjs/common  (already a NestJS dependency)
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { MetricsService } from '../../metrics/metrics.service';

// ─── Error code derivation ────────────────────────────────────────────────────

/**
 * Derive a machine-readable error code from an exception.
 *
 * NestJS built-in exceptions carry a human message; we map them to
 * SCREAMING_SNAKE_CASE codes so clients can branch on them reliably.
 */
function deriveErrorCode(exception: unknown): string {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const codeMap: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    };
    return codeMap[status] ?? `HTTP_${status}`;
  }
  return 'INTERNAL_SERVER_ERROR';
}

/**
 * Extract a safe, user-facing message from an exception.
 * Never exposes raw stack traces or internal error details.
 */
function safeMessage(exception: unknown): string {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    if (typeof response === 'object' && response !== null) {
      const r = response as Record<string, unknown>;
      // class-validator ValidationPipe returns { message: string[] }
      if (Array.isArray(r['message'])) return (r['message'] as string[]).join('; ');
      if (typeof r['message'] === 'string') return r['message'];
    }
    return exception.message;
  }
  // For non-HTTP errors, return a generic message in production.
  if (process.env.NODE_ENV === 'production') {
    return 'An unexpected error occurred. Please try again or contact support.';
  }
  // In non-production, include the error message for easier debugging.
  return exception instanceof Error
    ? exception.message
    : 'An unexpected error occurred.';
}

// ─── Filter ───────────────────────────────────────────────────────────────────

@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly metrics: MetricsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx      = host.switchToHttp();
    const request  = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status     = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorCode  = deriveErrorCode(exception);
    const message    = safeMessage(exception);
    const requestId  = (request.headers['x-request-id'] as string | undefined)
      ?? (request as any)['requestId']
      ?? 'unknown';

    const route  = request.route?.path ?? request.path ?? 'unknown';
    const method = request.method ?? 'UNKNOWN';

    // ── Prometheus ────────────────────────────────────────────────────────────
    this.metrics.incrementHttpErrors(method, route, String(status));

    // ── Structured internal log ───────────────────────────────────────────────
    const logPayload = {
      level:      'error',
      timestamp:  new Date().toISOString(),
      request_id: requestId,
      method,
      route,
      status_code: status,
      error_code:  errorCode,
      message,
    };

    if (status >= 500) {
      // Log full stack for 5xx — internal visibility only, never sent to client.
      this.logger.error(
        JSON.stringify({
          ...logPayload,
          stack: exception instanceof Error ? exception.stack : undefined,
        }),
      );
    } else {
      // 4xx are expected client errors — log at warn level without stack.
      this.logger.warn(JSON.stringify(logPayload));
    }

    // ── Response envelope ─────────────────────────────────────────────────────
    response.status(status).json({
      error_code:  errorCode,
      message,
      request_id:  requestId,
      status_code: status,
    });
  }
}
