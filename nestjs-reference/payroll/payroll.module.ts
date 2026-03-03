// @ts-nocheck
/**
 * PayrollModule — NestJS module for the payroll maker-checker workflow.
 *
 * Drop this module (and the files in dto/) into your NestJS project,
 * then import PayrollModule into your AppModule.
 *
 * Required npm packages (add to your NestJS project):
 *   npm install @nestjs/common @nestjs/core class-validator class-transformer
 *   npm install --save-dev @types/node
 *
 * Required environment variables:
 *   JPMC_ACH_DEBIT_ACCOUNT  — your J.P. Morgan operating account ID
 *   JPMC_ACH_COMPANY_ID     — your ACH company ID
 *   JPMORGAN_ACCESS_TOKEN   — OAuth bearer token
 *                             (or JPMC_CLIENT_ID + JPMC_CLIENT_SECRET + JPMC_TOKEN_URL)
 *   JPMORGAN_PAYMENTS_ENV   — 'sandbox' | 'testing' | 'production' (default: 'sandbox')
 *
 * Routes registered by this module:
 *   POST   /payroll/runs                     — Create DRAFT run (maker)
 *   GET    /payroll/runs/:id                 — Get run by UUID
 *   POST   /payroll/runs/:id/approve         — Approve run (checker)
 *   POST   /payroll/runs/:id/refresh-status  — Poll JPMC for payment statuses
 *
 * Example AppModule integration:
 *
 *   import { PayrollModule } from './payroll/payroll.module';
 *
 *   @Module({
 *     imports: [PayrollModule],
 *   })
 *   export class AppModule {}
 *
 * Example main.ts (enable global ValidationPipe):
 *
 *   import { ValidationPipe } from '@nestjs/common';
 *   async function bootstrap() {
 *     const app = await NestFactory.create(AppModule);
 *     app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
 *     await app.listen(3000);
 *   }
 *   bootstrap();
 */

import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  controllers: [PayrollController],
  providers:   [PayrollService],
  exports:     [PayrollService],
})
export class PayrollModule {}
