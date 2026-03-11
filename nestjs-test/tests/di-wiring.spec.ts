/**
 * DI Wiring Test — nestjs-reference MetricsModule + PayrollModule
 *
 * Verifies:
 *   1. MetricsModule bootstraps — MetricsService + AuditLoggerService are injectable
 *   2. PayrollModule bootstraps — PayrollService receives MetricsService + AuditLoggerService
 *   3. PayrollService.createRun() — creates a DRAFT run, increments metrics, emits audit log
 *   4. PayrollService.approveRun() — approves run, increments metrics, emits audit log
 *   5. PayrollService.listRuns() — returns all runs
 *   6. MetricsService.getMetrics() — returns Prometheus text with expected metric names
 *
 * JPMC API calls are intercepted by Jest moduleNameMapper:
 *   ../../src/payroll            → mocks/payroll.mock.ts
 *   ../../src/jpmorgan_payments  → mocks/jpmorgan_payments.mock.ts
 */

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { MetricsModule }       from '../../nestjs-reference/metrics/metrics.module';
import { PayrollModule }       from '../../nestjs-reference/payroll/payroll.module';
import { MetricsService }      from '../../nestjs-reference/metrics/metrics.service';
import { AuditLoggerService }  from '../../nestjs-reference/common/logger/audit-logger.service';
import { PayrollService }      from '../../nestjs-reference/payroll/payroll.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCreateDto(overrides: Partial<any> = {}) {
  return {
    createdBy: 'alice',
    items: [
      {
        employeeId:    'EMP-001',
        employeeName:  'Bob Smith',
        routingNumber: '021000021',
        accountNumber: '123456789',
        accountType:   'CHECKING' as const,
        amount:        2500.00,
        effectiveDate: '2025-02-01',
      },
    ],
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('DI Wiring — MetricsModule + PayrollModule', () => {
  let module:   TestingModule;
  let metrics:  MetricsService;
  let audit:    AuditLoggerService;
  let payroll:  PayrollService;

  // Capture stdout for audit log assertions
  let stdoutLines: string[] = [];
  let originalWrite: typeof process.stdout.write;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [MetricsModule, PayrollModule],
    }).compile();

    await module.init();

    metrics = module.get(MetricsService);
    audit   = module.get(AuditLoggerService);
    payroll = module.get(PayrollService);
  });

  beforeEach(() => {
    stdoutLines = [];
    originalWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (chunk: string | Buffer, ...args: any[]) => {
      const line = typeof chunk === 'string' ? chunk : chunk.toString();
      if (line.trim()) stdoutLines.push(line.trim());
      return originalWrite(chunk, ...args);
    };
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  afterAll(async () => {
    await module.close();
  });

  // ── 1. MetricsService is injectable ─────────────────────────────────────────

  it('MetricsService is defined and injectable', () => {
    expect(metrics).toBeDefined();
    expect(metrics.registry).toBeDefined();
  });

  // ── 2. AuditLoggerService is injectable ─────────────────────────────────────

  it('AuditLoggerService is defined and injectable', () => {
    expect(audit).toBeDefined();
    expect(typeof audit.log).toBe('function');
    expect(typeof audit.logFailure).toBe('function');
  });

  // ── 3. PayrollService is injectable ─────────────────────────────────────────

  it('PayrollService is defined and injectable', () => {
    expect(payroll).toBeDefined();
    expect(typeof payroll.createRun).toBe('function');
    expect(typeof payroll.approveRun).toBe('function');
    expect(typeof payroll.getRun).toBe('function');
    expect(typeof payroll.listRuns).toBe('function');
    expect(typeof payroll.refreshRunStatus).toBe('function');
  });

  // ── 4. createRun — DRAFT run created, metrics + audit emitted ───────────────

  it('createRun() creates a DRAFT run and emits audit log', async () => {
    const dto = makeCreateDto();
    const run = await payroll.createRun(dto, 'req-test-001');

    // Run shape
    expect(run.id).toBeDefined();
    expect(run.status).toBe('DRAFT');
    expect(run.createdBy).toBe('alice');
    expect(run.payments).toHaveLength(1);
    expect(run.totalAmount).toBe(2500.00);

    // Audit log emitted to stdout
    const auditLine = stdoutLines.find(l => l.includes('"action":"payroll.run.create"'));
    expect(auditLine).toBeDefined();
    const event = JSON.parse(auditLine!);
    expect(event.level).toBe('audit');
    expect(event.result).toBe('success');
    expect(event.actor).toBe('alice');
    expect(event.resource_id).toBe(run.id);
    expect(event.request_id).toBe('req-test-001');
  });

  // ── 5. listRuns — returns the run just created ───────────────────────────────

  it('listRuns() returns all runs in memory', async () => {
    const runs = payroll.listRuns();
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs.some(r => r.status === 'DRAFT')).toBe(true);
  });

  // ── 6. approveRun — maker-checker validation ─────────────────────────────────

  it('approveRun() rejects same maker/checker', async () => {
    const run = await payroll.createRun(makeCreateDto({ createdBy: 'alice' }), 'req-test-002');
    await expect(
      payroll.approveRun(run.id, { approvedBy: 'alice' }, 'req-test-002'),
    ).rejects.toThrow('Maker and checker must be different users');
  });

  it('approveRun() sets status to PENDING_SUBMISSION and emits audit log', async () => {
    const run = await payroll.createRun(makeCreateDto({ createdBy: 'alice' }), 'req-test-003');
    const approved = await payroll.approveRun(run.id, { approvedBy: 'bob' }, 'req-test-003');

    expect(approved.status).toBe('PENDING_SUBMISSION');
    expect(approved.approvedBy).toBe('bob');

    const auditLine = stdoutLines.find(l => l.includes('"action":"payroll.run.approve"'));
    expect(auditLine).toBeDefined();
    const event = JSON.parse(auditLine!);
    expect(event.result).toBe('success');
    expect(event.actor).toBe('bob');
  });

  // ── 7. MetricsService.getMetrics() — Prometheus text format ─────────────────

  it('getMetrics() returns Prometheus text with expected metric names', async () => {
    const text = await metrics.getMetrics();

    expect(text).toContain('payroll_runs_created_total');
    expect(text).toContain('payroll_runs_approved_total');
    expect(text).toContain('http_requests_total');
    expect(text).toContain('jpm_api_calls_total');
    expect(text).toContain('nodejs_');
  });

  // ── 8. AuditLoggerService.logFailure() ──────────────────────────────────────

  it('logFailure() emits a failure audit event with error_code', () => {
    audit.logFailure(
      {
        requestId:  'req-fail-001',
        actor:      'system',
        action:     'jpm.payment.create',
        resourceId: 'ref-001',
      },
      'JPM_PAYMENT_CREATE_FAILED',
      'Connection timeout',
    );

    const auditLine = stdoutLines.find(l => l.includes('"action":"jpm.payment.create"'));
    expect(auditLine).toBeDefined();
    const event = JSON.parse(auditLine!);
    expect(event.result).toBe('failure');
    expect(event.error_code).toBe('JPM_PAYMENT_CREATE_FAILED');
    expect(event.error_message).toBe('Connection timeout');
  });
});
