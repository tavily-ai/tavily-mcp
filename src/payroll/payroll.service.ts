// src/payroll/payroll.service.ts
/**
 * PayrollService — plain TypeScript adaptation of the NestJS PayrollService.
 *
 * Differences from the NestJS version:
 *   - No @Injectable() / NestJS decorators
 *   - No ConfigService — reads process.env directly
 *   - No NestJS Logger — uses console.log / console.error / console.warn
 *   - No NotFoundException / BadRequestException — throws plain Error
 *   - JpmcCorporateQuickPayClient.createAchPayment() → createPayrollPayment() from ../payroll.js
 *   - JpmcCorporateQuickPayClient.getPaymentStatus()  → getPayment()          from ../jpmorgan_payments.js
 *   - crypto.randomUUID() instead of uuid package
 *
 * Exports a singleton `payrollService` for use in the MCP server (src/index.ts).
 *
 * In-memory storage: the Map<string, PayrollRun> persists for the lifetime of
 * the MCP server process, which is sufficient for the stateful maker-checker
 * workflow within a single session.
 */

import { randomUUID } from 'crypto';
import type { PayrollRun, PayrollPayment, PayrollStatus } from './models/payroll-run.model.js';
import { createPayrollPayment } from '../payroll.js';
import { getPayment } from '../jpmorgan_payments.js';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

/** Input shape for creating a new payroll run (mirrors NestJS CreatePayrollRunDto). */
export interface CreatePayrollRunServiceDto {
  /** Maker user ID who is initiating the run */
  createdBy: string;
  /** Array of payroll items to disburse (minimum 1) */
  items: Array<{
    employeeId:    string;
    employeeName:  string;
    routingNumber: string;
    accountNumber: string;
    accountType:   'CHECKING' | 'SAVINGS';
    amount:        number;
    effectiveDate: string;
  }>;
}

/** Input shape for approving a payroll run (mirrors NestJS ApprovePayrollRunDto). */
export interface ApprovePayrollRunServiceDto {
  /** Checker user ID who is approving the run */
  approvedBy: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PayrollService {
  /**
   * In-memory store for payroll runs.
   * Replace with a DB repository in a production NestJS implementation.
   */
  private readonly runs = new Map<string, PayrollRun>();

  // ── createRun ──────────────────────────────────────────────────────────────

  /**
   * Create a new payroll run in DRAFT status.
   *
   * Builds PayrollPayment records from the DTO items, calculates the total
   * amount, and persists the run in the in-memory store.  No payments are
   * submitted to JPMC at this stage — submission happens after checker approval.
   *
   * @param dto - Maker user ID + array of payroll items
   * @returns The newly created PayrollRun in DRAFT status
   */
  async createRun(dto: CreatePayrollRunServiceDto): Promise<PayrollRun> {
    if (!dto.createdBy || dto.createdBy.trim() === '') {
      throw new Error('createdBy is required (maker user ID).');
    }
    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new Error('items must be a non-empty array of payroll items.');
    }

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
    console.log(`[PayrollService] Created payroll run ${id} with ${payments.length} payments, total $${totalAmount.toFixed(2)}`);

    return run;
  }

  // ── getRun ─────────────────────────────────────────────────────────────────

  /**
   * Retrieve a payroll run by its ID.
   *
   * @param id - The run UUID
   * @returns The PayrollRun entity
   * @throws Error if the run is not found
   */
  async getRun(id: string): Promise<PayrollRun> {
    const run = this.runs.get(id);
    if (!run) {
      throw new Error(`Payroll run not found: ${id}`);
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
   * fire-and-forget background task.  The run is returned immediately in
   * PENDING_SUBMISSION status; the caller can poll via refreshRunStatus()
   * or getRun() to observe the transition to SUBMITTED / FAILED.
   *
   * @param id  - The run UUID
   * @param dto - Checker user ID
   * @returns The updated PayrollRun in PENDING_SUBMISSION status
   * @throws Error if the run is not found, status is invalid, or maker === checker
   */
  async approveRun(id: string, dto: ApprovePayrollRunServiceDto): Promise<PayrollRun> {
    if (!dto.approvedBy || dto.approvedBy.trim() === '') {
      throw new Error('approvedBy is required (checker user ID).');
    }

    const run = await this.getRun(id);

    if (run.status !== 'DRAFT' && run.status !== 'PENDING_SUBMISSION') {
      throw new Error(
        `Run ${id} cannot be approved from status "${run.status}". ` +
        `Only DRAFT or PENDING_SUBMISSION runs can be approved.`
      );
    }

    if (run.createdBy === dto.approvedBy.trim()) {
      throw new Error(
        `Maker and checker must be different users (both are "${run.createdBy}").`
      );
    }

    run.approvedBy = dto.approvedBy.trim();
    run.approvedAt = new Date();
    run.status     = 'PENDING_SUBMISSION';
    this.runs.set(id, run);

    console.log(`[PayrollService] Run ${id} approved by ${run.approvedBy}, submitting to JPMorgan…`);

    // Fire-and-forget — submission runs asynchronously so the MCP tool
    // can return the PENDING_SUBMISSION state immediately.
    this.submitRunToJpmc(run.id).catch((err) => {
      console.error(`[PayrollService] Failed to submit run ${run.id}: ${err?.message ?? err}`);
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
   * Iterates over each PayrollPayment, calls createPayrollPayment() (which
   * maps to POST /payments/v1/payment), and stores the returned paymentId +
   * status on the payment record.  On completion the run status is set to
   * SUBMITTED.
   *
   * This method is intentionally private and called fire-and-forget from
   * approveRun().  Any uncaught error propagates to the .catch() handler in
   * approveRun(), which sets the run status to FAILED.
   *
   * @param runId - The run UUID
   */
  private async submitRunToJpmc(runId: string): Promise<void> {
    const run = await this.getRun(runId);

    if (run.status !== 'PENDING_SUBMISSION') {
      console.warn(`[PayrollService] Run ${runId} is not in PENDING_SUBMISSION (got "${run.status}"), skipping submission.`);
      return;
    }

    console.log(`[PayrollService] Submitting ${run.payments.length} payment(s) for run ${runId} to JPMorgan…`);

    for (const payment of run.payments) {
      const resp = await createPayrollPayment({
        employeeId:    payment.employeeId,
        employeeName:  payment.employeeName,
        routingNumber: payment.routingNumber,
        accountNumber: payment.accountNumber,
        accountType:   payment.accountType,
        amount:        payment.amount,
        effectiveDate: payment.effectiveDate,
      });

      payment.jpmcPaymentId = resp.paymentId ?? resp.id;
      payment.jpmcStatus    = resp.status as string | undefined;
    }

    run.status = 'SUBMITTED';
    this.runs.set(runId, run);

    console.log(`[PayrollService] Run ${runId} submitted — ${run.payments.length} payment(s) dispatched.`);
  }

  // ── refreshRunStatus ───────────────────────────────────────────────────────

  /**
   * Refresh the status of each payment in a run by polling the JPMC API.
   *
   * Only runs in SUBMITTED, PARTIALLY_POSTED, or PARTIALLY_RETURNED status
   * are eligible for refresh; all others are returned unchanged.
   *
   * Status derivation logic (mirrors the NestJS service):
   *   returned > 0 && posted > 0  → PARTIALLY_RETURNED
   *   returned > 0 && posted == 0 → RETURNED
   *   posted > 0 && posted < total → PARTIALLY_POSTED
   *   posted == total              → POSTED
   *
   * Note: JPMC may return "COMPLETED" instead of "POSTED" depending on the
   * payment rail; both are treated as posted for status derivation.
   *
   * @param runId - The run UUID
   * @returns The updated PayrollRun with refreshed payment statuses
   * @throws Error if the run is not found
   */
  async refreshRunStatus(runId: string): Promise<PayrollRun> {
    const run = await this.getRun(runId);

    const eligibleStatuses: PayrollStatus[] = ['SUBMITTED', 'PARTIALLY_POSTED', 'PARTIALLY_RETURNED'];
    if (!eligibleStatuses.includes(run.status)) {
      console.log(`[PayrollService] Run ${runId} is in status "${run.status}" — no refresh needed.`);
      return run;
    }

    let posted   = 0;
    let returned = 0;

    for (const payment of run.payments) {
      if (!payment.jpmcPaymentId) continue;

      const statusResp = await getPayment(payment.jpmcPaymentId);

      payment.jpmcStatus     = statusResp.status as string | undefined;
      // returnCode may be present on ACH return responses
      payment.jpmcReturnCode = (statusResp as any).returnCode ?? null;

      // Treat both POSTED and COMPLETED as "posted" (rail-dependent naming)
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
    console.log(`[PayrollService] Run ${runId} status refreshed → "${run.status}" (posted=${posted}, returned=${returned})`);

    return run;
  }

  // ── listRuns (utility) ─────────────────────────────────────────────────────

  /**
   * List all payroll runs currently held in memory.
   * Useful for debugging / inspection within a session.
   *
   * @returns Array of all PayrollRun entities
   */
  listRuns(): PayrollRun[] {
    return Array.from(this.runs.values());
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

/**
 * Singleton PayrollService instance shared across the MCP server process.
 * The in-memory Map persists for the lifetime of the process.
 */
export const payrollService = new PayrollService();
export default payrollService;
