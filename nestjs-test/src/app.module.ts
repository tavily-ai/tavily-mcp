import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { MetricsModule } from '../../nestjs-reference/metrics/metrics.module';
import { PayrollModule } from '../../nestjs-reference/payroll/payroll.module';

/**
 * Minimal AppModule for live DI wiring verification.
 *
 * Imports:
 *   MetricsModule  — @Global() module: MetricsService, AuditLoggerService,
 *                    MetricsController (GET /metrics), global interceptors + filter
 *   PayrollModule  — PayrollController + PayrollService (injects MetricsService
 *                    and AuditLoggerService from MetricsModule)
 *
 * JPMC API calls in PayrollService are intercepted by Jest moduleNameMapper
 * (../../src/payroll → mocks/payroll.mock.ts) so no live credentials are needed.
 */
@Module({
  imports: [MetricsModule, PayrollModule],
})
export class AppModule {}
