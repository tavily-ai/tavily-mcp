# NestJS Prometheus + SOC 2 Implementation Plan

## New files to create
- [x] `nestjs-reference/common/utils/pii.util.ts`
- [x] `nestjs-reference/common/logger/audit-logger.service.ts`
- [x] `nestjs-reference/common/filters/all-exceptions.filter.ts`
- [x] `nestjs-reference/common/interceptors/http-metrics.interceptor.ts`
- [x] `nestjs-reference/common/interceptors/audit-log.interceptor.ts`
- [x] `nestjs-reference/metrics/metrics.service.ts`
- [x] `nestjs-reference/metrics/metrics.controller.ts`
- [x] `nestjs-reference/metrics/metrics.module.ts`

## Files to modify
- [x] `nestjs-reference/payroll/payroll.service.ts` — inject MetricsService + AuditLoggerService
- [x] `nestjs-reference/payroll/payroll.module.ts` — import MetricsModule
- [x] `nestjs-reference/jpm/jpm.module.ts` — import MetricsModule
- [x] `nestjs-reference/jpm/controllers/jpm-payment.controller.ts` — add audit logging + metrics

## Follow-up
- [x] Update `nestjs-reference/README.md` with metrics + SOC 2 docs
