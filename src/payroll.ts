/**
 * J.P. Morgan Payroll ACH Payment Module
 *
 * Provides payroll disbursement via ACH payments through the J.P. Morgan
 * Payments API. Each payroll item maps to a single ACH credit transfer to
 * an employee's bank account.
 *
 * Mirrors the shape of CreatePayrollItemDto / CreatePayrollRunDto (NestJS DTOs)
 * but implemented as plain TypeScript interfaces — no class-validator dependency required.
 *
 * Required environment variables:
 *   JPMC_ACH_DEBIT_ACCOUNT  — your J.P. Morgan operating account ID
 *   JPMC_ACH_COMPANY_ID     — your ACH company ID
 *   JPMORGAN_ACCESS_TOKEN   — OAuth bearer token (or use JPMC_CLIENT_ID/SECRET)
 *
 * Optional:
 *   JPMC_CLIENT_ID          — OAuth client ID (client credentials grant)
 *   JPMC_CLIENT_SECRET      — OAuth client secret
 *   JPMC_TOKEN_URL          — OAuth token endpoint
 *   JPMORGAN_PAYMENTS_ENV   — 'sandbox' | 'testing' | 'production' (default: 'sandbox')
 *
 * Usage:
 *   import { createPayrollPayment, createBatchPayroll } from './payroll.js';
 *
 *   // Single employee
 *   const result = await createPayrollPayment({
 *     employeeId:    'EMP-001',
 *     employeeName:  'Jane Smith',
 *     routingNumber: '021000021',
 *     accountNumber: '123456789',
 *     accountType:   'CHECKING',
 *     amount:        2500.00,
 *     effectiveDate: '2026-03-14'
 *   });
 *
 *   // Payroll run (named batch with maker user ID)
 *   const run = await createPayrollRun({
 *     createdBy: 'user-123',
 *     items: [item1, item2, item3]
 *   });
 */

import {
  createPayment,
  isJPMorganPaymentsConfigured,
  getJPMorganPaymentsConfig,
  JPMORGAN_PAYMENTS_SERVER,
  type PaymentResponse
} from './jpmorgan_payments.js';

// ─── Server Metadata ──────────────────────────────────────────────────────────

export const PAYROLL_SERVER = {
  name:        'jpmorgan-payroll',
  title:       'J.P. Morgan Payroll ACH Payments',
  version:     'v1',
  description: 'Disburse employee payroll via ACH credit transfers through the J.P. Morgan Payments API.',
  docsUrl:     'https://developer.jpmorgan.com',
  env: {
    JPMC_ACH_DEBIT_ACCOUNT:  'your-jpmc-operating-account-id',
    JPMC_ACH_COMPANY_ID:     'your-ach-company-id',
    JPMORGAN_ACCESS_TOKEN:   'your-jpmorgan-oauth-access-token',
    JPMORGAN_PAYMENTS_ENV:   'sandbox'  // 'sandbox' | 'testing' | 'production'
  }
} as const;

// ─── TypeScript Interfaces ────────────────────────────────────────────────────

/**
 * A single payroll disbursement item.
 * Mirrors CreatePayrollItemDto without class-validator decorators.
 */
export interface PayrollItem {
  /** Unique employee identifier (e.g. 'EMP-001') */
  employeeId: string;
  /** Full name of the employee */
  employeeName: string;
  /** ABA routing number of the employee's bank (9 digits) */
  routingNumber: string;
  /** Employee's bank account number */
  accountNumber: string;
  /** Bank account type */
  accountType: 'CHECKING' | 'SAVINGS';
  /** Gross pay amount in USD (e.g. 2500.00) */
  amount: number;
  /** Requested ACH settlement date in ISO 8601 format (yyyy-MM-dd) */
  effectiveDate: string;
}

/** Result of a single payroll payment attempt */
export interface PayrollResult {
  /** The payroll item that was processed */
  item: PayrollItem;
  /** Whether the payment was successfully submitted */
  success: boolean;
  /** The payment response from J.P. Morgan (present on success) */
  payment?: PaymentResponse;
  /** Error message (present on failure) */
  error?: string;
}

/** Aggregated result of a batch payroll run */
export interface BatchPayrollResult {
  /** Total number of items submitted */
  total: number;
  /** Number of successfully submitted payments */
  succeeded: number;
  /** Number of failed payment submissions */
  failed: number;
  /** Per-item results */
  results: PayrollResult[];
  /** ISO 8601 timestamp of when the batch was processed */
  processedAt: string;
}

/**
 * A named payroll run — a batch of payroll items submitted by a specific maker user.
 * Mirrors CreatePayrollRunDto without class-validator decorators.
 */
export interface PayrollRun {
  /** Maker user ID who initiated the payroll run (e.g. 'user-123') */
  createdBy: string;
  /** Array of payroll items to disburse (minimum 1) */
  items: PayrollItem[];
}

/** Result of a named payroll run — extends BatchPayrollResult with maker metadata */
export interface PayrollRunResult extends BatchPayrollResult {
  /** Maker user ID who initiated the run */
  createdBy: string;
}

/**
 * Checker approval for a payroll run.
 * Mirrors ApprovePayrollRunDto without class-validator decorators.
 *
 * Because the MCP server is stateless (no database), the checker must supply
 * both their user ID and the payroll items they are approving.  In a full
 * NestJS implementation the items would be retrieved from the database by
 * run ID; here they are passed explicitly.
 */
export interface PayrollRunApproval {
  /** Checker user ID who is approving the run (e.g. 'checker-456') */
  approvedBy: string;
  /** The payroll items being approved for disbursement (minimum 1) */
  items: PayrollItem[];
}

/** Result of a checker-approved payroll run — extends BatchPayrollResult with approvedBy */
export interface PayrollRunApprovalResult extends BatchPayrollResult {
  /** Checker user ID who approved the run */
  approvedBy: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a PayrollItem and return a list of validation error messages.
 * Returns an empty array if the item is valid.
 */
export function validatePayrollItem(item: PayrollItem): string[] {
  const errors: string[] = [];

  if (!item.employeeId || typeof item.employeeId !== 'string' || item.employeeId.trim() === '') {
    errors.push('employeeId is required and must be a non-empty string.');
  }

  if (!item.employeeName || typeof item.employeeName !== 'string' || item.employeeName.trim() === '') {
    errors.push('employeeName is required and must be a non-empty string.');
  }

  if (!item.routingNumber || typeof item.routingNumber !== 'string') {
    errors.push('routingNumber is required and must be a string.');
  } else if (!/^\d{9}$/.test(item.routingNumber.trim())) {
    errors.push('routingNumber must be exactly 9 digits.');
  }

  if (!item.accountNumber || typeof item.accountNumber !== 'string' || item.accountNumber.trim() === '') {
    errors.push('accountNumber is required and must be a non-empty string.');
  }

  if (!item.accountType || !['CHECKING', 'SAVINGS'].includes(item.accountType)) {
    errors.push("accountType must be 'CHECKING' or 'SAVINGS'.");
  }

  if (item.amount === undefined || item.amount === null) {
    errors.push('amount is required.');
  } else if (typeof item.amount !== 'number' || isNaN(item.amount)) {
    errors.push('amount must be a number.');
  } else if (item.amount <= 0) {
    errors.push('amount must be greater than 0.');
  } else if (!isFinite(item.amount)) {
    errors.push('amount must be a finite number.');
  }

  if (!item.effectiveDate || typeof item.effectiveDate !== 'string') {
    errors.push('effectiveDate is required and must be a string.');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(item.effectiveDate.trim())) {
    errors.push('effectiveDate must be in yyyy-MM-dd format (e.g. 2026-03-14).');
  } else {
    const parsed = new Date(item.effectiveDate);
    if (isNaN(parsed.getTime())) {
      errors.push('effectiveDate is not a valid calendar date.');
    }
  }

  return errors;
}

// ─── Validation (PayrollRun) ──────────────────────────────────────────────────

/**
 * Validate a PayrollRun and return a list of validation error messages.
 * Validates the run-level fields (createdBy, items array) and each item.
 * Returns an empty array if the run is fully valid.
 */
export function validatePayrollRun(run: PayrollRun): string[] {
  const errors: string[] = [];

  if (!run.createdBy || typeof run.createdBy !== 'string' || run.createdBy.trim() === '') {
    errors.push('createdBy is required and must be a non-empty string (maker user ID).');
  }

  if (!Array.isArray(run.items)) {
    errors.push('items must be an array of PayrollItem objects.');
    return errors; // can't iterate non-array
  }

  if (run.items.length === 0) {
    errors.push('items must contain at least one PayrollItem (@ArrayMinSize(1)).');
    return errors;
  }

  run.items.forEach((item, index) => {
    const itemErrors = validatePayrollItem(item);
    itemErrors.forEach(e => errors.push(`items[${index}] (${item?.employeeId ?? 'unknown'}): ${e}`));
  });

  return errors;
}

// ─── Validation (PayrollRunApproval) ─────────────────────────────────────────

/**
 * Validate a PayrollRunApproval and return a list of validation error messages.
 * Validates the approval-level field (approvedBy) and each payroll item.
 * Returns an empty array if the approval is fully valid.
 *
 * Mirrors the validation that would be applied to ApprovePayrollRunDto
 * (approvedBy: @IsString()) plus the items array.
 */
export function validatePayrollRunApproval(approval: PayrollRunApproval): string[] {
  const errors: string[] = [];

  if (!approval.approvedBy || typeof approval.approvedBy !== 'string' || approval.approvedBy.trim() === '') {
    errors.push('approvedBy is required and must be a non-empty string (checker user ID).');
  }

  if (!Array.isArray(approval.items)) {
    errors.push('items must be an array of PayrollItem objects.');
    return errors; // can't iterate non-array
  }

  if (approval.items.length === 0) {
    errors.push('items must contain at least one PayrollItem (@ArrayMinSize(1)).');
    return errors;
  }

  approval.items.forEach((item, index) => {
    const itemErrors = validatePayrollItem(item);
    itemErrors.forEach(e => errors.push(`items[${index}] (${item?.employeeId ?? 'unknown'}): ${e}`));
  });

  return errors;
}

// ─── Configuration Helpers ────────────────────────────────────────────────────

/**
 * Check whether the payroll module is fully configured.
 * Delegates to the underlying J.P. Morgan Payments configuration check.
 */
export function isPayrollConfigured(): boolean {
  return isJPMorganPaymentsConfigured();
}

/**
 * Return payroll configuration details (mirrors getJPMorganPaymentsConfig).
 */
export function getPayrollConfig() {
  return {
    ...getJPMorganPaymentsConfig(),
    module: PAYROLL_SERVER.name,
    title:  PAYROLL_SERVER.title
  };
}

/**
 * List available payroll MCP tools.
 */
export function listPayrollTools(): Array<{
  name: string;
  description: string;
  method: string;
  endpoint: string;
}> {
  return [
    {
      name:        'jpmorgan_create_payroll_payment',
      description: 'Submit a single employee payroll disbursement as an ACH credit transfer via the J.P. Morgan Payments API.',
      method:      'POST',
      endpoint:    '/payments/v1/payment'
    },
    {
      name:        'jpmorgan_create_batch_payroll',
      description: 'Submit a batch of employee payroll disbursements as ACH credit transfers. Processes each item sequentially and returns a per-item success/failure summary.',
      method:      'POST',
      endpoint:    '/payments/v1/payment (×N)'
    },
    {
      name:        'jpmorgan_create_payroll_run',
      description: 'Submit a named payroll run (CreatePayrollRunDto) with a maker user ID and an array of payroll items. Validates the full run before submission and returns a per-item result with the createdBy field attached.',
      method:      'POST',
      endpoint:    '/payments/v1/payment (×N)'
    },
    {
      name:        'jpmorgan_approve_payroll_run',
      description: 'Approve and execute a payroll run as a checker (maker-checker workflow). Mirrors ApprovePayrollRunDto: provide approvedBy (checker user ID) and the payroll items to approve. Validates the approval, submits all ACH payments, and returns a per-item result with the approvedBy field attached.',
      method:      'POST',
      endpoint:    '/payments/v1/payment (×N)'
    }
  ];
}

// ─── Core API Functions ───────────────────────────────────────────────────────

/**
 * Submit a single payroll disbursement as an ACH credit transfer.
 *
 * Maps PayrollItem fields to the J.P. Morgan ACH payment shape:
 *   - creditAccount  ← routingNumber + accountNumber + accountType
 *   - amount.value   ← amount.toFixed(2)
 *   - amount.currency← 'USD'
 *   - memo           ← 'Payroll - <employeeName> (<employeeId>)'
 *   - effectiveDate  ← effectiveDate
 *   - debitAccount   ← JPMC_ACH_DEBIT_ACCOUNT env var
 *   - companyId      ← JPMC_ACH_COMPANY_ID env var
 *
 * @param item - The payroll item to disburse
 * @returns The J.P. Morgan payment response with paymentId and initial status
 * @throws If validation fails or the API call fails
 *
 * @example
 * const result = await createPayrollPayment({
 *   employeeId:    'EMP-042',
 *   employeeName:  'Alice Johnson',
 *   routingNumber: '021000021',
 *   accountNumber: '987654321',
 *   accountType:   'CHECKING',
 *   amount:        3200.00,
 *   effectiveDate: '2026-03-14'
 * });
 * console.log(result.paymentId); // 'PAY-20260314-042'
 */
export async function createPayrollPayment(item: PayrollItem): Promise<PaymentResponse> {
  // Validate the item before sending
  const validationErrors = validatePayrollItem(item);
  if (validationErrors.length > 0) {
    throw new Error(
      `Payroll item validation failed for employee "${item.employeeId}":\n` +
      validationErrors.map(e => `  • ${e}`).join('\n')
    );
  }

  return createPayment({
    paymentType:   'ACH',
    debitAccount:  process.env.JPMC_ACH_DEBIT_ACCOUNT ?? '',
    companyId:     process.env.JPMC_ACH_COMPANY_ID,
    creditAccount: {
      routingNumber: item.routingNumber.trim(),
      accountNumber: item.accountNumber.trim(),
      accountType:   item.accountType
    },
    amount: {
      currency: 'USD',
      value:    item.amount.toFixed(2)
    },
    memo:          `Payroll - ${item.employeeName.trim()} (${item.employeeId.trim()})`,
    effectiveDate: item.effectiveDate.trim()
  });
}

/**
 * Submit a named payroll run.
 *
 * Mirrors CreatePayrollRunDto:
 *   - createdBy: string  — maker user ID
 *   - items: PayrollItem[] — array of payroll items (min 1)
 *
 * Validates the entire run before submitting any payments.
 * Delegates to createBatchPayroll() for sequential ACH submission.
 * Returns a PayrollRunResult that extends BatchPayrollResult with createdBy.
 *
 * @param run - The payroll run to submit
 * @returns Aggregated run result with per-item success/failure details and createdBy
 * @throws If run-level or item-level validation fails
 *
 * @example
 * const result = await createPayrollRun({
 *   createdBy: 'user-123',
 *   items: [
 *     { employeeId: 'EMP-001', employeeName: 'Alice', routingNumber: '021000021',
 *       accountNumber: '111', accountType: 'CHECKING', amount: 1000, effectiveDate: '2026-03-14' }
 *   ]
 * });
 * console.log(`Run by ${result.createdBy}: ${result.succeeded}/${result.total} succeeded`);
 */
export async function createPayrollRun(run: PayrollRun): Promise<PayrollRunResult> {
  const validationErrors = validatePayrollRun(run);
  if (validationErrors.length > 0) {
    throw new Error(
      `Payroll run validation failed:\n` +
      validationErrors.map(e => `  • ${e}`).join('\n')
    );
  }

  const batchResult = await createBatchPayroll(run.items);

  return {
    ...batchResult,
    createdBy: run.createdBy.trim()
  };
}

/**
 * Approve and execute a payroll run as a checker (maker-checker workflow).
 *
 * Mirrors ApprovePayrollRunDto:
 *   - approvedBy: string  — checker user ID (@IsString())
 *   - items: PayrollItem[] — payroll items to approve and disburse (min 1)
 *
 * Validates the entire approval before submitting any payments.
 * Delegates to createBatchPayroll() for sequential ACH submission.
 * Returns a PayrollRunApprovalResult that extends BatchPayrollResult with approvedBy.
 *
 * @param approval - The approval containing checker ID and payroll items
 * @returns Aggregated approval result with per-item success/failure details and approvedBy
 * @throws If approval-level or item-level validation fails
 *
 * @example
 * const result = await approvePayrollRun({
 *   approvedBy: 'checker-456',
 *   items: [
 *     { employeeId: 'EMP-001', employeeName: 'Alice', routingNumber: '021000021',
 *       accountNumber: '111', accountType: 'CHECKING', amount: 1000, effectiveDate: '2026-03-14' }
 *   ]
 * });
 * console.log(`Approved by ${result.approvedBy}: ${result.succeeded}/${result.total} succeeded`);
 */
export async function approvePayrollRun(approval: PayrollRunApproval): Promise<PayrollRunApprovalResult> {
  const validationErrors = validatePayrollRunApproval(approval);
  if (validationErrors.length > 0) {
    throw new Error(
      `Payroll run approval validation failed:\n` +
      validationErrors.map(e => `  • ${e}`).join('\n')
    );
  }

  const batchResult = await createBatchPayroll(approval.items);

  return {
    ...batchResult,
    approvedBy: approval.approvedBy.trim()
  };
}

/**
 * Submit a batch of payroll disbursements as ACH credit transfers.
 *
 * Processes each item sequentially (to respect API rate limits).
 * A failure on one item does NOT abort the remaining items — all items
 * are attempted and the per-item outcome is captured in the result.
 *
 * @param items - Array of payroll items to disburse
 * @returns Aggregated batch result with per-item success/failure details
 * @throws If the items array is empty or not an array
 *
 * @example
 * const batch = await createBatchPayroll([
 *   { employeeId: 'EMP-001', employeeName: 'Bob', routingNumber: '021000021',
 *     accountNumber: '111', accountType: 'CHECKING', amount: 1000, effectiveDate: '2026-03-14' },
 *   { employeeId: 'EMP-002', employeeName: 'Carol', routingNumber: '021000021',
 *     accountNumber: '222', accountType: 'SAVINGS', amount: 1500, effectiveDate: '2026-03-14' }
 * ]);
 * console.log(`${batch.succeeded}/${batch.total} payments submitted`);
 */
export async function createBatchPayroll(items: PayrollItem[]): Promise<BatchPayrollResult> {
  if (!Array.isArray(items)) {
    throw new Error('items must be an array of PayrollItem objects.');
  }
  if (items.length === 0) {
    throw new Error('items array must not be empty. Provide at least one payroll item.');
  }

  const results: PayrollResult[] = [];
  let succeeded = 0;
  let failed    = 0;

  for (const item of items) {
    try {
      const payment = await createPayrollPayment(item);
      results.push({ item, success: true, payment });
      succeeded++;
    } catch (err: any) {
      results.push({ item, success: false, error: err?.message ?? String(err) });
      failed++;
    }
  }

  return {
    total:       items.length,
    succeeded,
    failed,
    results,
    processedAt: new Date().toISOString()
  };
}

export default {
  PAYROLL_SERVER,
  isPayrollConfigured,
  getPayrollConfig,
  listPayrollTools,
  validatePayrollItem,
  validatePayrollRun,
  validatePayrollRunApproval,
  createPayrollPayment,
  createBatchPayroll,
  createPayrollRun,
  approvePayrollRun
};
