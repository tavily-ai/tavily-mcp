// @ts-nocheck
/**
 * AuditLogInterceptor — NestJS interceptor that attaches a request_id to every
 * inbound HTTP request and emits a structured access log entry on completion.
 *
 * Registered globally via MetricsModule (APP_INTERCEPTOR token).
 *
 * Responsibilities:
 *   1. Read X-Request-Id from the inbound request header, or generate a new
 *      UUID v4 if the header is absent.
 *   2. Attach the request_id to the Express request object so downstream
 *      services (PayrollService, JpmPaymentController, etc.) can include it
 *      in their audit events without re-reading the header.
 *   3. Emit a structured NDJSON access log line on every request completion
 *      (success and error paths) for SOC 2 traceability.
 *   4. Set X-Request-Id on the outbound response so clients can correlate
 *      their requests with server-side logs.
 *
 * Access log shape (written to stdout as NDJSON):
 * {
 *   "level":       "access",
 *   "timestamp":   "2026-01-15T10:30:00.000Z",
 *   "request_id":  "550e8400-e29b-41d4-a716-446655440000",
 *   "method":      "POST",
 *   "route":       "/payroll/runs/:id/approve",
 *   "status_code": 200,
 *   "duration_ms": 142
 * }
 *
 * SOC 2 requirements satisfied:
 *   A1.2  — Every request has a unique, traceable request_id.
 *   CC6.1 — Access events logged with method, route, status, and duration.
 *
 * Required npm packages:
 *   @nestjs/common  (already a NestJS dependency)
 *   crypto          (Node.js built-in)
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import type { Request, Response } from 'express';

// ─── Request augmentation ─────────────────────────────────────────────────────

/**
 * Augment the Express Request type to carry our request_id field.
 * Downstream services read `(req as AuditRequest).requestId`.
 */
export interface AuditRequest extends Request {
  requestId: string;
}

// ─── Interceptor ──────────────────────────────────────────────────────────────

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request  = context.switchToHttp().getRequest<AuditRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    // ── 1. Resolve / generate request_id ─────────────────────────────────────
    const requestId: string =
      (request.headers['x-request-id'] as string | undefined)?.trim()
      || randomUUID();

    // Attach to request so services can read it without re-parsing headers.
    request.requestId = requestId;

    // Echo back on the response for client-side correlation.
    response.setHeader('X-Request-Id', requestId);

    const startMs = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.writeAccessLog(request, response, requestId, startMs);
      }),
      catchError((err) => {
        // Write the access log even on error — the filter will set the status.
        this.writeAccessLog(request, response, requestId, startMs, err);
        return throwError(() => err);
      }),
    );
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private writeAccessLog(
    request:   AuditRequest,
    response:  Response,
    requestId: string,
    startMs:   number,
    err?:      unknown,
  ): void {
    const durationMs = Date.now() - startMs;
    const route      = request.route?.path ?? request.path ?? 'unknown';
    const method     = request.method ?? 'UNKNOWN';

    // Prefer the response status; fall back to error status or 500.
    const statusCode: number =
      response.statusCode
      ?? (err as any)?.status
      ?? (err instanceof Error ? 500 : 200);

    const record = {
      level:       'access',
      timestamp:   new Date().toISOString(),
      request_id:  requestId,
      method,
      route,
      status_code: statusCode,
      duration_ms: durationMs,
    };

    process.stdout.write(JSON.stringify(record) + '\n');
  }
}
