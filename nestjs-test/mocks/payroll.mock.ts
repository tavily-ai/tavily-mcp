/**
 * Mock stub for ../../src/payroll (ESM → CommonJS bridge for nestjs-test).
 * Returns a synthetic JPMC payment response so PayrollService can be tested
 * without a live JPMC connection.
 */
export async function createPayrollPayment(_params: unknown): Promise<{
  paymentId: string;
  id: string;
  status: string;
}> {
  return {
    paymentId: 'mock-payment-id-' + Math.random().toString(36).slice(2, 8),
    id:        'mock-id',
    status:    'SUBMITTED',
  };
}
