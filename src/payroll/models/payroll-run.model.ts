// src/payroll/models/payroll-run.model.ts

/**
 * Lifecycle status of a payroll run.
 *
 * State machine:
 *   DRAFT → PENDING_SUBMISSION → SUBMITTED
 *     → PARTIALLY_POSTED | POSTED
 *     → PARTIALLY_RETURNED | RETURNED | FAILED
 */
export type PayrollStatus =
  | 'DRAFT'
  | 'PENDING_SUBMISSION'
  | 'SUBMITTED'
  | 'PARTIALLY_POSTED'
  | 'POSTED'
  | 'PARTIALLY_RETURNED'
  | 'RETURNED'
  | 'FAILED';

/**
 * A single payroll payment record — the domain entity persisted after
 * submission to the J.P. Morgan Payments API.
 *
 * Extends the input fields from PayrollItem with:
 *   - id:              internal record identifier
 *   - jpmcPaymentId:   payment ID returned by the JPMC API
 *   - jpmcStatus:      payment status reported by the JPMC API
 *   - jpmcReturnCode:  ACH return code (e.g. 'R01') if the payment was returned
 */
export interface PayrollPayment {
  /** Internal record identifier (e.g. 'EMP-001-1710000000000') */
  id: string;
  /** Unique employee identifier */
  employeeId: string;
  /** Full name of the employee */
  employeeName: string;
  /** ABA routing number of the employee's bank (9 digits) */
  routingNumber: string;
  /** Employee's bank account number */
  accountNumber: string;
  /** Bank account type */
  accountType: 'CHECKING' | 'SAVINGS';
  /** Gross pay amount in USD */
  amount: number;
  /** Requested ACH settlement date in yyyy-MM-dd format */
  effectiveDate: string;
  /** Payment ID returned by the J.P. Morgan Payments API (present on success) */
  jpmcPaymentId?: string;
  /** Payment status reported by the J.P. Morgan Payments API */
  jpmcStatus?: string;
  /** ACH return code if the payment was returned (e.g. 'R01' = insufficient funds) */
  jpmcReturnCode?: string | null;
}

/**
 * A payroll run domain entity — the full lifecycle record of a payroll run.
 *
 * Created by the maker (createdBy) and optionally approved by the checker
 * (approvedBy) in a maker-checker workflow.
 *
 * Mirrors the shape of a persisted PayrollRun record in a NestJS/database
 * implementation, but implemented as a plain TypeScript interface for use
 * in the stateless MCP server.
 */
export interface PayrollRun {
  /** Unique run identifier (e.g. 'run-1710000000000') */
  id: string;
  /** ISO 8601 timestamp when the run was created */
  createdAt: Date;
  /** Maker user ID who initiated the run */
  createdBy: string;
  /** ISO 8601 timestamp when the run was approved (checker step) */
  approvedAt?: Date;
  /** Checker user ID who approved the run */
  approvedBy?: string;
  /** Current lifecycle status of the run */
  status: PayrollStatus;
  /** Sum of all payment amounts in USD */
  totalAmount: number;
  /** Per-employee payment records */
  payments: PayrollPayment[];
}
