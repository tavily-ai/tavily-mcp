// @ts-nocheck
/**
 * PayrollService — NestJS @Injectable() adaptation
 *
 * Drop-in NestJS version of src/payroll/payroll.service.ts.
 * Differences from the plain-TS version:
 *   - @Injectable() decorator for NestJS DI
 *   - NestJS Logger instead of console.log / console.error
 *   - NotFoundException instead of plain Error for "not found" cases
 *   - BadRequestException instead of plain Error for validation failures
 *   - Imports CreatePayrollRunDto / ApprovePayrollRunDto from local DTOs
 *     (class-validator validated by ValidationPipe before reaching the service)
 *
 * In-memory storage: the Map<string, PayrollRun> persists for the lifetime of
 * the NestJS process.  Replace with a TypeORM / Prisma repository in production.
 *
 * Required npm packages (add to your NestJS project):
 *   npm install @nestjs/common class-validator class-transformer
 *   npm install --save-dev @types/node
 *
 * Required environment variables (same as src/payroll/payroll.service.ts):
 *   JPMC_ACH_DEBIT_ACCOUNT  — your J.P. Morgan operating account ID
 *   JPMC_ACH_COMPANY_ID     — your ACH company ID
 *   JPMORGAN_ACCESS_TOKEN   — OAuth bearer token (or use JPMC_CLIENT_ID/SECRET)
 */

import { randomUUID } from 'crypto';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { ApprovePayrollRunDto } from './dto/approve-payroll-run.dto';
import { MetricsService } from '../metrics/metrics.service';
import { AuditLoggerService } from '../common/logger/audit-logger.service';
import { maskPaymentItem } from '../common/utils/pii.util';

// ─── Domain model (re-used from src) ─────────────────────────────────────────
// Import the shared domain types from the plain-TS model file.
// Adjust the relative path if you copy this module into a different location.
import type {
  PayrollRun,
  PayrollPayment,
  PayrollStatus,
} from '../../src/payroll/models/payroll-run.model';

// ─── External API helpers (re-used from src) ──────────────────────────────────
// These plain-TS helpers call the J.P. Morgan Payments API.
// They read JPMC_* env vars directly — no ConfigService dependency.
import { createPayrollPayment } from '../../src/payroll';
import { getPayment } from '../../src/jpmorgan_payments';

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  /**
   * In-memory store for payroll runs.
   * Replace with a TypeORM / Prisma repository in production.
   */
  private readonly runs = new Map<string, PayrollRun>();

  constructor(
    private readonly metrics: MetricsService,
    private readonly audit: AuditLoggerService,
  ) {}

  // ── createRun ──────────────────────────────────────────────────────────────

  /**
   * Create a new payroll run in DRAFT status.
   *
   * Builds PayrollPayment records from the DTO items, calculates the total
   * amount, and persists the run in the in-memory store.  No payments are
   * submitted to JPMC at this stage — submission happens after checker approval.
   *
   * @param dto - Validated CreatePayrollRunDto (maker user ID + payroll items)
   * @returns The newly created PayrollRun in DRAFT status
   */
  async createRun(dto: CreatePayrollRunDto, requestId = 'unknown'): Promise<PayrollRun> {
    const id = randomUUID();

    const payments: PayrollPayment[] = dto.items.map((item) => ({
      id:            randomUUID(),
      employeeId:    item.employeeId,
      employeeName:  item.employeeName,
      routingNumber: item.routingNumber,
      accountNumber: item.accountNumber,
      accountType:   item.accountType,
      amount:        item.amount,
      effectiveDate: item.effectiveDate,
    }));

    const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

    const run: PayrollRun = {
      id,
      createdAt:   new Date(),
      createdBy:   dto.createdBy.trim(),
      status:      'DRAFT',
      totalAmount,
      payments,
    };

    this.runs.set(id, run);
    this.logger.log(
      `Created payroll run ${id} with ${payments.length} payments, total $${totalAmount.toFixed(2)}`,
    );

    // ── Metrics ──────────────────────────────────────────────────────────────
    this.metrics.incrementPayrollRunsCreated();
    this.metrics.observePayrollRunAmount(totalAmount);

    // ── SOC 2 audit event ─────────────────────────────────────────────────────
    this.audit.log({
      requestId,
      actor:      run.createdBy,
      action:     'payroll.run.create',
      resourceId: run.id,
      result:     'success',
      extras: {
        payment_count: payments.length,
        amount_usd:    totalAmount,
        payments:      payments.map(maskPaymentItem),
      },
    });

    return run;
  }

  // ── getRun ─────────────────────────────────────────────────────────────────

  /**
   * Retrieve a payroll run by its UUID.
   *
   * @param id - The run UUID
   * @returns The PayrollRun entity
   * @throws NotFoundException if the run is not found
   */
  async getRun(id: string): Promise<PayrollRun> {
    const run = this.runs.get(id);
    if (!run) {
      throw new NotFoundException(`Payroll run not found: ${id}`);
    }
    return run;
  }

  // ── approveRun ─────────────────────────────────────────────────────────────

  /**
   * Approve a payroll run as a checker (maker-checker workflow).
   *
   * Validates:
   *   - Run must be in DRAFT or PENDING_SUBMISSION status
   *   - Checker (approvedBy) must differ from the maker (createdBy)
   *
   * Sets status to PENDING_SUBMISSION and fires submitRunToJpmc() as a
   * fire-and-forget background task.  Returns immediately in PENDING_SUBMISSION
   * status; the caller can poll via refreshRunStatus() or getRun().
   *
   * @param id  - The run UUID
   * @param dto - Validated ApprovePayrollRunDto (checker user ID)
   * @returns The updated PayrollRun in PENDING_SUBMISSION status
   * @throws NotFoundException if the run is not found
   * @throws BadRequestException if the status is invalid or maker === checker
   */
  async approveRun(id: string, dto: ApprovePayrollRunDto, requestId = 'unknown'): Promise<PayrollRun> {
    const run = await this.getRun(id);

    if (run.status !== 'DRAFT' && run.status !== 'PENDING_SUBMISSION') {
      throw new BadRequestException(
        `Run ${id} cannot be approved from status "${run.status}". ` +
        `Only DRAFT or PENDING_SUBMISSION runs can be approved.`,
      );
    }

    if (run.createdBy === dto.approvedBy.trim()) {
      throw new BadRequestException(
        `Maker and checker must be different users (both are "${run.createdBy}").`,
      );
    }

    run.approvedBy = dto.approvedBy.trim();
    run.approvedAt = new Date();
    run.status     = 'PENDING_SUBMISSION';
    this.runs.set(id, run);

    this.logger.log(`Run ${id} approved by ${run.approvedBy}, submitting to JPMorgan…`);

    // ── Metrics ──────────────────────────────────────────────────────────────
    this.metrics.incrementPayrollRunsApproved();

    // ── SOC 2 audit event ─────────────────────────────────────────────────────
    this.audit.log({
      requestId,
      actor:      run.approvedBy,
      action:     'payroll.run.approve',
      resourceId: run.id,
      result:     'success',
      extras: {
        maker:         run.createdBy,
        payment_count: run.payments.length,
        amount_usd:    run.totalAmount,
      },
    });

    // Fire-and-forget — submission runs asynchronously so the controller
    // can return the PENDING_SUBMISSION state immediately.
    this.submitRunToJpmc(run.id).catch((err) => {
      this.logger.error(`Failed to submit run ${run.id}: ${err?.message ?? err}`);
      this.metrics.incrementPayrollRunsSubmitted('failure');
      const current = this.runs.get(run.id);
      if (current) {
        current.status = 'FAILED';
        this.runs.set(run.id, current);
      }
    });

    return run;
  }

  // ── submitRunToJpmc (private) ──────────────────────────────────────────────

  /**
   * Submit all payments in a run to the J.P. Morgan Payments API.
   *
   * Called fire-and-forget from approveRun().  Any uncaught error propagates
   * to the .catch() handler in approveRun(), which sets the run status to FAILED.
   *
   * @param runId - The run UUID
   */
  private async submitRunToJpmc(runId: string): Promise<void> {
    const run = await this.getRun(runId);

    if (run.status !== 'PENDING_SUBMISSION') {
      this.logger.warn(
        `Run ${runId} is not in PENDING_SUBMISSION (got "${run.status}"), skipping submission.`,
      );
      return;
    }

    this.logger.log(`Submitting ${run.payments.length} payment(s) for run ${runId} to JPMorgan…`);

    for (const payment of run.payments) {
      const endTimer = this.metrics.startPayrollJpmcTimer('createAchPayment');
      const resp = await createPayrollPayment({
        employeeId:    payment.employeeId,
        employeeName:  payment.employeeName,
        routingNumber: payment.routingNumber,
        accountNumber: payment.accountNumber,
        accountType:   payment.accountType,
        amount:        payment.amount,
        effectiveDate: payment.effectiveDate,
      })
        .then((r) => {
          this.metrics.incrementJpmApiCalls('createAchPayment', 'success');
          return r;
        })
        .catch((err) => {
          this.metrics.incrementJpmApiCalls('createAchPayment', 'failure');
          throw err;
        })
        .finally(() => endTimer());

      payment.jpmcPaymentId = resp.paymentId ?? resp.id;
      payment.jpmcStatus    = resp.status as string | undefined;
    }

    run.status = 'SUBMITTED';
    this.runs.set(runId, run);

    // ── Metrics ──────────────────────────────────────────────────────────────
    this.metrics.incrementPayrollRunsSubmitted('success');
    for (const p of run.payments) {
      if (p.jpmcStatus) this.metrics.incrementPayrollPayments(p.jpmcStatus);
    }

    this.logger.log(`Run ${runId} submitted — ${run.payments.length} payment(s) dispatched.`);
  }

  // ── refreshRunStatus ───────────────────────────────────────────────────────

  /**
   * Refresh the status of each payment in a run by polling the JPMC API.
   *
   * Only runs in SUBMITTED, PARTIALLY_POSTED, or PARTIALLY_RETURNED status
   * are eligible for refresh; all others are returned unchanged.
   *
   * Status derivation logic:
   *   returned > 0 && posted > 0  → PARTIALLY_RETURNED
   *   returned > 0 && posted == 0 → RETURNED
   *   posted > 0 && posted < total → PARTIALLY_POSTED
   *   posted == total              → POSTED
   *
   * @param runId - The run UUID
   * @returns The updated PayrollRun with refreshed payment statuses
   * @throws NotFoundException if the run is not found
   */
  async refreshRunStatus(runId: string, requestId = 'unknown'): Promise<PayrollRun> {
    const run = await this.getRun(runId);

    const eligibleStatuses: PayrollStatus[] = ['SUBMITTED', 'PARTIALLY_POSTED', 'PARTIALLY_RETURNED'];
    if (!eligibleStatuses.includes(run.status)) {
      this.logger.log(`Run ${runId} is in status "${run.status}" — no refresh needed.`);
      return run;
    }

    let posted   = 0;
    let returned = 0;

    for (const payment of run.payments) {
      if (!payment.jpmcPaymentId) continue;

      const endTimer = this.metrics.startPayrollJpmcTimer('getPayment');
      const statusResp = await getPayment(payment.jpmcPaymentId)
        .then((r) => { this.metrics.incrementJpmApiCalls('getPayment', 'success'); return r; })
        .catch((err) => { this.metrics.incrementJpmApiCalls('getPayment', 'failure'); throw err; })
        .finally(() => endTimer());

      payment.jpmcStatus     = statusResp.status as string | undefined;
      payment.jpmcReturnCode = (statusResp as any).returnCode ?? null;

      const isPosted   = statusResp.status === 'POSTED' || statusResp.status === 'COMPLETED';
      const isReturned = statusResp.status === 'RETURNED';

      if (isPosted)   posted++;
      if (isReturned) returned++;
    }

    const total = run.payments.filter(p => p.jpmcPaymentId).length;

    if (returned > 0 && posted > 0) {
      run.status = 'PARTIALLY_RETURNED';
    } else if (returned > 0 && posted === 0) {
      run.status = 'RETURNED';
    } else if (posted > 0 && posted < total) {
      run.status = 'PARTIALLY_POSTED';
    } else if (total > 0 && posted === total) {
      run.status = 'POSTED';
    }

    this.runs.set(runId, run);
    this.logger.log(
      `Run ${runId} status refreshed → "${run.status}" (posted=${posted}, returned=${returned})`,
    );

    // ── Metrics ──────────────────────────────────────────────────────────────
    for (const p of run.payments) {
      if (p.jpmcStatus) this.metrics.incrementPayrollPayments(p.jpmcStatus);
    }

    // ── SOC 2 audit event ─────────────────────────────────────────────────────
    this.audit.log({
      requestId,
      actor:      'system',
      action:     'payroll.run.refresh_status',
      resourceId: runId,
      result:     'success',
      extras: {
        new_status: run.status,
        posted,
        returned,
      },
    });

    return run;
  }

  // ── listRuns ───────────────────────────────────────────────────────────────

  /**
   * List all payroll runs currently held in memory.
   * Useful for admin / debugging endpoints.
   *
   * @returns Array of all PayrollRun entities
   */
  listRuns(): PayrollRun[] {
    return Array.from(this.runs.values());
  }
}
