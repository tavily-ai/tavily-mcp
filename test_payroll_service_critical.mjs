/**
 * Critical-path tests for the stateful PayrollService.
 *
 * Tests (no live API calls):
 *  10. PayrollService.createRun()       — DRAFT creation, UUID, totalAmount, validation
 *  11. PayrollService.getRun()          — retrieval by ID, not-found error
 *  12. PayrollService.approveRun()      — maker≠checker, status transitions, validation
 *  13. PayrollService.refreshRunStatus() — guard logic (ineligible statuses, no jpmcPaymentId)
 *  14. formatPayrollRunEntity()         — output shape for DRAFT and approved runs
 *
 * Run: node test_payroll_service_critical.mjs
 *
 * Note: submitRunToJpmc() and the JPMC-polling path of refreshRunStatus() require
 * a live API and are intentionally excluded from this suite.
 */

import { PayrollService } from './build/payroll/payroll.service.js';

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        console.log(`  ✓ ${name}`);
        passed++;
      }).catch(err => {
        console.error(`  ✗ ${name}`);
        console.error(`    ${err.message}`);
        failed++;
      });
    }
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
  return Promise.resolve();
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertThrows(fn, expectedMsg) {
  try {
    fn();
    throw new Error(`Expected function to throw, but it did not`);
  } catch (err) {
    if (err.message === `Expected function to throw, but it did not`) throw err;
    if (expectedMsg && !err.message.includes(expectedMsg)) {
      throw new Error(`Expected error containing "${expectedMsg}", got: "${err.message}"`);
    }
  }
}

async function assertRejects(asyncFn, expectedMsg) {
  try {
    await asyncFn();
    throw new Error(`Expected async function to reject, but it resolved`);
  } catch (err) {
    if (err.message === `Expected async function to reject, but it resolved`) throw err;
    if (expectedMsg && !err.message.includes(expectedMsg)) {
      throw new Error(`Expected rejection containing "${expectedMsg}", got: "${err.message}"`);
    }
  }
}

// ─── Shared test data ─────────────────────────────────────────────────────────

const VALID_ITEM_1 = {
  employeeId:    'EMP-001',
  employeeName:  'Alice Johnson',
  routingNumber: '021000021',
  accountNumber: '123456789',
  accountType:   'CHECKING',
  amount:        2500.00,
  effectiveDate: '2026-03-14'
};

const VALID_ITEM_2 = {
  employeeId:    'EMP-002',
  employeeName:  'Bob Smith',
  routingNumber: '021000021',
  accountNumber: '987654321',
  accountType:   'SAVINGS',
  amount:        1800.00,
  effectiveDate: '2026-03-14'
};

// ─── 10. PayrollService.createRun() ──────────────────────────────────────────

console.log('\n10. PayrollService.createRun()');

const promises = [];

promises.push(test('creates a run with DRAFT status', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  assert(run.status === 'DRAFT', `Expected DRAFT, got ${run.status}`);
}));

promises.push(test('generates a UUID for the run ID', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  // UUID v4 pattern: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert(typeof run.id === 'string', 'run.id should be a string');
  assert(uuidPattern.test(run.id), `run.id "${run.id}" is not a valid UUID v4`);
}));

promises.push(test('calculates totalAmount as sum of all item amounts', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({
    createdBy: 'user-123',
    items: [VALID_ITEM_1, VALID_ITEM_2]  // 2500 + 1800 = 4300
  });
  assert(run.totalAmount === 4300, `Expected totalAmount 4300, got ${run.totalAmount}`);
}));

promises.push(test('creates PayrollPayment records with UUIDs for each item', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({
    createdBy: 'user-123',
    items: [VALID_ITEM_1, VALID_ITEM_2]
  });
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert(run.payments.length === 2, `Expected 2 payments, got ${run.payments.length}`);
  for (const p of run.payments) {
    assert(uuidPattern.test(p.id), `payment.id "${p.id}" is not a valid UUID v4`);
  }
}));

promises.push(test('maps item fields onto PayrollPayment records correctly', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  const p = run.payments[0];
  assert(p.employeeId    === VALID_ITEM_1.employeeId,    'employeeId mapped');
  assert(p.employeeName  === VALID_ITEM_1.employeeName,  'employeeName mapped');
  assert(p.routingNumber === VALID_ITEM_1.routingNumber, 'routingNumber mapped');
  assert(p.accountNumber === VALID_ITEM_1.accountNumber, 'accountNumber mapped');
  assert(p.accountType   === VALID_ITEM_1.accountType,   'accountType mapped');
  assert(p.amount        === VALID_ITEM_1.amount,        'amount mapped');
  assert(p.effectiveDate === VALID_ITEM_1.effectiveDate, 'effectiveDate mapped');
  assert(p.jpmcPaymentId === undefined, 'jpmcPaymentId is undefined on DRAFT');
  assert(p.jpmcStatus    === undefined, 'jpmcStatus is undefined on DRAFT');
}));

promises.push(test('sets createdBy and createdAt on the run', async () => {
  const svc = new PayrollService();
  const before = new Date();
  const run = await svc.createRun({ createdBy: 'maker-user', items: [VALID_ITEM_1] });
  const after = new Date();
  assert(run.createdBy === 'maker-user', `createdBy should be "maker-user", got "${run.createdBy}"`);
  assert(run.createdAt instanceof Date, 'createdAt should be a Date');
  assert(run.createdAt >= before && run.createdAt <= after, 'createdAt should be within test window');
}));

promises.push(test('throws when createdBy is empty string', async () => {
  const svc = new PayrollService();
  await assertRejects(
    () => svc.createRun({ createdBy: '', items: [VALID_ITEM_1] }),
    'createdBy is required'
  );
}));

promises.push(test('throws when createdBy is whitespace-only', async () => {
  const svc = new PayrollService();
  await assertRejects(
    () => svc.createRun({ createdBy: '   ', items: [VALID_ITEM_1] }),
    'createdBy is required'
  );
}));

promises.push(test('throws when items array is empty', async () => {
  const svc = new PayrollService();
  await assertRejects(
    () => svc.createRun({ createdBy: 'user-123', items: [] }),
    'items must be a non-empty array'
  );
}));

promises.push(test('stores the run so it can be retrieved by ID', async () => {
  const svc = new PayrollService();
  const created = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  const retrieved = await svc.getRun(created.id);
  assert(retrieved.id === created.id, 'retrieved run has same ID');
  assert(retrieved.status === 'DRAFT', 'retrieved run is still DRAFT');
}));

// ─── 11. PayrollService.getRun() ─────────────────────────────────────────────

console.log('\n11. PayrollService.getRun()');

promises.push(test('returns the run for a known ID', async () => {
  const svc = new PayrollService();
  const created = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  const run = await svc.getRun(created.id);
  assert(run.id === created.id, 'IDs match');
  assert(run.createdBy === 'user-123', 'createdBy matches');
  assert(run.status === 'DRAFT', 'status is DRAFT');
}));

promises.push(test('throws for an unknown run ID', async () => {
  const svc = new PayrollService();
  await assertRejects(
    () => svc.getRun('00000000-0000-4000-8000-000000000000'),
    'Payroll run not found'
  );
}));

promises.push(test('returns the same run object (reference equality)', async () => {
  const svc = new PayrollService();
  const created = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  const r1 = await svc.getRun(created.id);
  const r2 = await svc.getRun(created.id);
  assert(r1 === r2, 'getRun returns the same object reference');
}));

promises.push(test('two different runs have different IDs', async () => {
  const svc = new PayrollService();
  const r1 = await svc.createRun({ createdBy: 'user-A', items: [VALID_ITEM_1] });
  const r2 = await svc.createRun({ createdBy: 'user-B', items: [VALID_ITEM_2] });
  assert(r1.id !== r2.id, 'Two runs should have different UUIDs');
}));

// ─── 12. PayrollService.approveRun() ─────────────────────────────────────────

console.log('\n12. PayrollService.approveRun()');

promises.push(test('throws when approvedBy is empty string', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  await assertRejects(
    () => svc.approveRun(run.id, { approvedBy: '' }),
    'approvedBy is required'
  );
}));

promises.push(test('throws when approvedBy is whitespace-only', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  await assertRejects(
    () => svc.approveRun(run.id, { approvedBy: '   ' }),
    'approvedBy is required'
  );
}));

promises.push(test('throws for an unknown run ID', async () => {
  const svc = new PayrollService();
  await assertRejects(
    () => svc.approveRun('00000000-0000-4000-8000-000000000000', { approvedBy: 'checker-456' }),
    'Payroll run not found'
  );
}));

promises.push(test('throws when maker and checker are the same user', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'same-user', items: [VALID_ITEM_1] });
  await assertRejects(
    () => svc.approveRun(run.id, { approvedBy: 'same-user' }),
    'Maker and checker must be different users'
  );
}));

promises.push(test('throws when run is in SUBMITTED status (not approvable)', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  // Manually set status to SUBMITTED to simulate a run that has already been submitted
  run.status = 'SUBMITTED';
  await assertRejects(
    () => svc.approveRun(run.id, { approvedBy: 'checker-456' }),
    'cannot be approved from status'
  );
}));

promises.push(test('throws when run is in FAILED status (not approvable)', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  run.status = 'FAILED';
  await assertRejects(
    () => svc.approveRun(run.id, { approvedBy: 'checker-456' }),
    'cannot be approved from status'
  );
}));

promises.push(test('sets status to PENDING_SUBMISSION on success', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  const approved = await svc.approveRun(run.id, { approvedBy: 'checker-456' });
  assert(approved.status === 'PENDING_SUBMISSION',
    'Expected PENDING_SUBMISSION status after approval');
}));

promises.push(test('sets approvedBy and approvedAt on the run', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  const before = new Date();
  const approved = await svc.approveRun(run.id, { approvedBy: 'checker-456' });
  const after = new Date();
  assert(approved.approvedBy === 'checker-456', 'approvedBy should be checker-456');
  assert(approved.approvedAt instanceof Date, 'approvedAt should be a Date');
  assert(approved.approvedAt >= before && approved.approvedAt <= after,
    'approvedAt should be within test window');
}));

promises.push(test('returns the run immediately (fire-and-forget submission)', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  const start = Date.now();
  const approved = await svc.approveRun(run.id, { approvedBy: 'checker-456' });
  const elapsed = Date.now() - start;
  // Should return almost immediately (< 500ms) — submission is async
  assert(elapsed < 500, `approveRun took ${elapsed}ms — should return immediately`);
  assert(approved.status === 'PENDING_SUBMISSION', 'Status is PENDING_SUBMISSION on return');
}));

promises.push(test('PENDING_SUBMISSION run can also be approved (idempotent re-approval guard)', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  // First approval
  await svc.approveRun(run.id, { approvedBy: 'checker-456' });
  // Second approval on PENDING_SUBMISSION should succeed (status is still approvable)
  const reApproved = await svc.approveRun(run.id, { approvedBy: 'checker-789' });
  assert(reApproved.status === 'PENDING_SUBMISSION', 'Re-approval sets PENDING_SUBMISSION again');
  assert(reApproved.approvedBy === 'checker-789', 'approvedBy updated to new checker');
}));

promises.push(test('approvedBy is trimmed before storage', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  const approved = await svc.approveRun(run.id, { approvedBy: '  checker-456  ' });
  assert(approved.approvedBy === 'checker-456', 'approvedBy should be trimmed');
}));

// ─── 13. PayrollService.refreshRunStatus() — guard logic ─────────────────────

console.log('\n13. PayrollService.refreshRunStatus() — guard logic');

promises.push(test('returns run unchanged when status is DRAFT (ineligible)', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  assert(run.status === 'DRAFT', 'Precondition: run is DRAFT');
  const refreshed = await svc.refreshRunStatus(run.id);
  assert(refreshed.status === 'DRAFT', 'DRAFT run should be returned unchanged');
  assert(refreshed === run, 'Should return the same run object');
}));

promises.push(test('returns run unchanged when status is FAILED (ineligible)', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  run.status = 'FAILED';
  const refreshed = await svc.refreshRunStatus(run.id);
  assert(refreshed.status === 'FAILED', 'FAILED run should be returned unchanged');
}));

promises.push(test('returns run unchanged when status is POSTED (ineligible)', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  run.status = 'POSTED';
  const refreshed = await svc.refreshRunStatus(run.id);
  assert(refreshed.status === 'POSTED', 'POSTED run should be returned unchanged');
}));

promises.push(test('returns run unchanged when status is RETURNED (ineligible)', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  run.status = 'RETURNED';
  const refreshed = await svc.refreshRunStatus(run.id);
  assert(refreshed.status === 'RETURNED', 'RETURNED run should be returned unchanged');
}));

promises.push(test('returns run unchanged when status is PENDING_SUBMISSION (ineligible)', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  run.status = 'PENDING_SUBMISSION';
  const refreshed = await svc.refreshRunStatus(run.id);
  assert(refreshed.status === 'PENDING_SUBMISSION', 'PENDING_SUBMISSION run should be returned unchanged');
}));

promises.push(test('throws for an unknown run ID', async () => {
  const svc = new PayrollService();
  await assertRejects(
    () => svc.refreshRunStatus('00000000-0000-4000-8000-000000000000'),
    'Payroll run not found'
  );
}));

promises.push(test('SUBMITTED run with no jpmcPaymentIds — skips all payments, status unchanged', async () => {
  // When no payments have jpmcPaymentId, the loop skips all of them.
  // posted=0, returned=0, total=0 → none of the status-derivation conditions fire.
  // Status stays SUBMITTED.
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1, VALID_ITEM_2] });
  run.status = 'SUBMITTED';
  // Payments have no jpmcPaymentId (as created by createRun)
  assert(run.payments.every(p => !p.jpmcPaymentId), 'Precondition: no jpmcPaymentIds');
  const refreshed = await svc.refreshRunStatus(run.id);
  assert(refreshed.status === 'SUBMITTED', 'Status stays SUBMITTED when no payments have jpmcPaymentId');
}));

promises.push(test('PARTIALLY_POSTED run with no jpmcPaymentIds — status unchanged', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  run.status = 'PARTIALLY_POSTED';
  const refreshed = await svc.refreshRunStatus(run.id);
  assert(refreshed.status === 'PARTIALLY_POSTED', 'Status stays PARTIALLY_POSTED when no jpmcPaymentIds');
}));

promises.push(test('PARTIALLY_RETURNED run with no jpmcPaymentIds — status unchanged', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  run.status = 'PARTIALLY_RETURNED';
  const refreshed = await svc.refreshRunStatus(run.id);
  assert(refreshed.status === 'PARTIALLY_RETURNED', 'Status stays PARTIALLY_RETURNED when no jpmcPaymentIds');
}));

// ─── 14. formatPayrollRunEntity() — output shape ─────────────────────────────

console.log('\n14. formatPayrollRunEntity() — output shape');

// Replicate the formatter from src/index.ts for testing purposes
function formatPayrollRunEntity(run) {
  const output = [];
  output.push('J.P. Morgan Payroll Run:');
  output.push('');
  output.push(`  Run ID:       ${run.id}`);
  output.push(`  Status:       ${run.status}`);
  output.push(`  Created By:   ${run.createdBy}`);
  output.push(`  Created At:   ${run.createdAt instanceof Date ? run.createdAt.toISOString() : run.createdAt}`);
  if (run.approvedBy) output.push(`  Approved By:  ${run.approvedBy}`);
  if (run.approvedAt) output.push(`  Approved At:  ${run.approvedAt instanceof Date ? run.approvedAt.toISOString() : run.approvedAt}`);
  output.push(`  Total Amount: $${run.totalAmount.toFixed(2)} USD`);
  output.push(`  Payments:     ${run.payments.length}`);
  output.push('');

  if (run.payments.length === 0) {
    output.push('No payment records.');
    return output.join('\n');
  }

  output.push('Payment Records:');
  run.payments.forEach((p, idx) => {
    output.push(`\n  [${idx + 1}] ${p.employeeName} (${p.employeeId})`);
    output.push(`       Amount:         $${p.amount.toFixed(2)} USD`);
    output.push(`       Effective Date: ${p.effectiveDate}`);
    output.push(`       Account Type:   ${p.accountType}`);
    if (p.jpmcPaymentId) output.push(`       JPMC Payment ID: ${p.jpmcPaymentId}`);
    if (p.jpmcStatus)    output.push(`       JPMC Status:     ${p.jpmcStatus}`);
    if (p.jpmcReturnCode) output.push(`       Return Code:    ${p.jpmcReturnCode}`);
  });

  return output.join('\n');
}

promises.push(test('DRAFT run output contains run ID, status, createdBy, totalAmount', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1, VALID_ITEM_2] });
  const output = formatPayrollRunEntity(run);

  assert(output.includes('J.P. Morgan Payroll Run:'),  'Contains header');
  assert(output.includes(run.id),                      'Contains run ID');
  assert(output.includes('Status:       DRAFT'),        'Contains DRAFT status');
  assert(output.includes('Created By:   user-123'),     'Contains createdBy');
  assert(output.includes('$4300.00 USD'),               'Contains totalAmount');
  assert(output.includes('Payments:     2'),            'Contains payment count');
}));

promises.push(test('DRAFT run output contains payment records for each employee', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1, VALID_ITEM_2] });
  const output = formatPayrollRunEntity(run);

  assert(output.includes('Alice Johnson'),              'Contains first employee name');
  assert(output.includes('EMP-001'),                    'Contains first employee ID');
  assert(output.includes('$2500.00 USD'),               'Contains first employee amount');
  assert(output.includes('Bob Smith'),                  'Contains second employee name');
  assert(output.includes('EMP-002'),                    'Contains second employee ID');
  assert(output.includes('$1800.00 USD'),               'Contains second employee amount');
}));

promises.push(test('DRAFT run output does NOT contain JPMC Payment ID (not yet submitted)', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  const output = formatPayrollRunEntity(run);

  assert(!output.includes('JPMC Payment ID'), 'Should not contain JPMC Payment ID for DRAFT run');
  assert(!output.includes('JPMC Status'),     'Should not contain JPMC Status for DRAFT run');
}));

promises.push(test('approved run output contains Approved By and Approved At', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  const approved = await svc.approveRun(run.id, { approvedBy: 'checker-456' });
  const output = formatPayrollRunEntity(approved);

  assert(output.includes('Status:       PENDING_SUBMISSION'), 'Contains PENDING_SUBMISSION status');
  assert(output.includes('Approved By:  checker-456'),        'Contains approvedBy');
  assert(output.includes('Approved At:'),                     'Contains approvedAt label');
}));

promises.push(test('run with JPMC tracking fields shows them in output', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  // Simulate what submitRunToJpmc would set
  run.payments[0].jpmcPaymentId = 'PAY-TEST-001';
  run.payments[0].jpmcStatus    = 'PENDING';
  run.status = 'SUBMITTED';
  const output = formatPayrollRunEntity(run);

  assert(output.includes('Status:       SUBMITTED'),          'Contains SUBMITTED status');
  assert(output.includes('JPMC Payment ID: PAY-TEST-001'),    'Contains JPMC Payment ID');
  assert(output.includes('JPMC Status:     PENDING'),         'Contains JPMC Status');
}));

promises.push(test('run with ACH return code shows it in output', async () => {
  const svc = new PayrollService();
  const run = await svc.createRun({ createdBy: 'user-123', items: [VALID_ITEM_1] });
  run.payments[0].jpmcPaymentId  = 'PAY-TEST-002';
  run.payments[0].jpmcStatus     = 'RETURNED';
  run.payments[0].jpmcReturnCode = 'R01';
  run.status = 'RETURNED';
  const output = formatPayrollRunEntity(run);

  assert(output.includes('JPMC Status:     RETURNED'),  'Contains RETURNED status');
  assert(output.includes('Return Code:    R01'),         'Contains ACH return code R01');
}));

// ─── Wait for all async tests, then print summary ────────────────────────────

Promise.all(promises).then(() => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\n❌ Some tests failed.');
    process.exit(1);
  } else {
    console.log('\n✅ All critical-path tests passed.');
    process.exit(0);
  }
});
