/**
 * Mock stub for ../../src/payroll/models/payroll-run.model
 * Re-exports the same types so PayrollService type imports resolve correctly
 * in the CommonJS nestjs-test context.
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

export interface PayrollPayment {
  id: string;
  employeeId: string;
  employeeName: string;
  routingNumber: string;
  accountNumber: string;
  accountType: 'CHECKING' | 'SAVINGS';
  amount: number;
  effectiveDate: string;
  jpmcPaymentId?: string;
  jpmcStatus?: string;
  jpmcReturnCode?: string | null;
}

export interface PayrollRun {
  id: string;
  createdAt: Date;
  createdBy: string;
  approvedAt?: Date;
  approvedBy?: string;
  status: PayrollStatus;
  totalAmount: number;
  payments: PayrollPayment[];
}
