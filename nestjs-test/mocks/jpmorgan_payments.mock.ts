/**
 * Mock stub for ../../src/jpmorgan_payments (ESM → CommonJS bridge for nestjs-test).
 * Returns a synthetic JPMC payment status so PayrollService.refreshRunStatus()
 * can be tested without a live JPMC connection.
 */
export async function getPayment(_id: string): Promise<{
  status: string;
  returnCode?: string | null;
}> {
  return {
    status:     'POSTED',
    returnCode: null,
  };
}
