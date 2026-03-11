// @ts-nocheck
/**
 * PayrollController — NestJS REST controller for the payroll maker-checker workflow.
 *
 * Routes:
 *   POST   /payroll/runs              — Create a DRAFT payroll run (maker)
 *   GET    /payroll/runs/:id          — Retrieve a run by UUID
 *   POST   /payroll/runs/:id/approve  — Approve a run (checker)
 *   POST   /payroll/runs/:id/refresh-status — Poll JPMC for latest payment statuses
 *
 * Prerequisites:
 *   - PayrollModule imported in AppModule (see payroll.module.ts)
 *   - ValidationPipe enabled globally or at controller level (whitelist: true, transform: true)
 *
 * Example global setup in main.ts:
 *   app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { ApprovePayrollRunDto } from './dto/approve-payroll-run.dto';

@Controller('payroll')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  /**
   * POST /payroll/runs
   *
   * Maker step: create a new payroll run in DRAFT status.
   * No payments are submitted at this stage.
   *
   * Body: CreatePayrollRunDto { createdBy, items[] }
   */
  @Post('runs')
  createRun(@Body() dto: CreatePayrollRunDto) {
    return this.payrollService.createRun(dto);
  }

  /**
   * GET /payroll/runs/:id
   *
   * Retrieve a payroll run by its UUID.
   * Returns the full run entity including per-payment JPMC tracking fields.
   */
  @Get('runs/:id')
  getRun(@Param('id') id: string) {
    return this.payrollService.getRun(id);
  }

  /**
   * POST /payroll/runs/:id/approve
   *
   * Checker step: approve a DRAFT run and trigger async ACH submission.
   * Returns immediately in PENDING_SUBMISSION status.
   * Poll GET /payroll/runs/:id to observe SUBMITTED / POSTED / FAILED transitions.
   *
   * Body: ApprovePayrollRunDto { approvedBy }
   */
  @Post('runs/:id/approve')
  approveRun(
    @Param('id') id: string,
    @Body() dto: ApprovePayrollRunDto,
  ) {
    return this.payrollService.approveRun(id, dto);
  }

  /**
   * POST /payroll/runs/:id/refresh-status
   *
   * Poll the JPMC Payments API for the latest status of each payment in the run.
   * Only eligible for runs in SUBMITTED, PARTIALLY_POSTED, or PARTIALLY_RETURNED status.
   * Updates per-payment jpmcStatus / jpmcReturnCode and derives the run lifecycle status.
   */
  @Post('runs/:id/refresh-status')
  refreshRunStatus(@Param('id') id: string) {
    return this.payrollService.refreshRunStatus(id);
  }
}
