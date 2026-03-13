// @ts-nocheck
/**
 * MetricsModule — Global NestJS module for Prometheus metrics + SOC 2 infrastructure.
 *
 * Registers and exports:
 *   MetricsService       — prom-client registry + all metric definitions
 *   MetricsController    — GET /metrics scrape endpoint for Grafana Alloy
 *   AuditLoggerService   — SOC 2 structured JSON audit logger
 *   AllExceptionsFilter  — Global exception filter (structured error envelope)
 *
 * Import once in AppModule:
 *
 *   @Module({
 *     imports: [MetricsModule, JpmModule, PayrollModule],
 *   })
 *   export class AppModule {}
 *
 * The module is marked @Global() so MetricsService and AuditLoggerService
 * are available for injection in every other module without re-importing.
 *
 * Global exception filter registration (main.ts):
 *
 *   import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
 *   import { MetricsService }      from './metrics/metrics.service';
 *
 *   async function bootstrap() {
 *     const app = await NestFactory.create(AppModule);
 *     const metrics = app.get(MetricsService);
 *     app.useGlobalFilters(new AllExceptionsFilter(metrics));
 *     await app.listen(3000);
 *   }
 *
 * Alternatively, register via DI (preferred — allows injection of MetricsService):
 *
 *   providers: [
 *     { provide: APP_FILTER, useClass: AllExceptionsFilter },
 *   ]
 *
 * Required npm packages (add to your NestJS project):
 *   npm install prom-client
 *   npm install @nestjs/common @nestjs/core
 */

import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsService }          from './metrics.service';
import { MetricsController }       from './metrics.controller';
import { AuditLoggerService }      from '../common/logger/audit-logger.service';
import { AllExceptionsFilter }     from '../common/filters/all-exceptions.filter';
import { HttpMetricsInterceptor }  from '../common/interceptors/http-metrics.interceptor';
import { AuditLogInterceptor }     from '../common/interceptors/audit-log.interceptor';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    AuditLoggerService,

    // ── Global exception filter ──────────────────────────────────────────────
    // Registered via APP_FILTER token so NestJS DI can inject MetricsService.
    // Catches all unhandled exceptions and returns a structured error envelope.
    {
      provide:  APP_FILTER,
      useClass: AllExceptionsFilter,
    },

    // ── Global HTTP metrics interceptor ─────────────────────────────────────
    // Records http_requests_total and http_request_duration_seconds for every
    // inbound HTTP request, regardless of which module handles it.
    {
      provide:  APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },

    // ── Global audit-log interceptor ─────────────────────────────────────────
    // Attaches a request_id (from X-Request-Id header or auto-generated UUID)
    // to every request context so downstream services can correlate audit events.
    {
      provide:  APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
  exports: [
    MetricsService,
    AuditLoggerService,
  ],
})
export class MetricsModule {}
