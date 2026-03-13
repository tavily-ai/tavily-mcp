# SOC 2 Compliance Review Prompt

## Context
Reviewing code for SOC 2 compliance, security best practices, and audit logging requirements.

## Input
- File or code section to review: <file-path-or-code>
- Operation type: <financial|data-access|authentication|other>

## Review Checklist

### PII Handling
- [ ] No raw account numbers in logs (use `maskPaymentItem()`)
- [ ] No raw routing numbers in logs
- [ ] No SSNs, tax IDs, or personal identifiers in error messages
- [ ] PII masking applied before audit logging

### Audit Logging
- [ ] Financial operations use `AuditLoggerService`
- [ ] All actions include `actor` (user ID or system)
- [ ] All actions include `resource_id` (entity being modified)
- [ ] Actions include `result` (success/failure)
- [ ] Financial events include `amount_usd` and `payment_count`
- [ ] Timestamp is ISO 8601 format
- [ ] Request ID is included for traceability

### Security Controls
- [ ] Input validation using DTOs with `class-validator`
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output encoding)
- [ ] Certificate validation for mTLS connections
- [ ] OAuth token handling (never logged, proper refresh)
- [ ] Error messages don't expose stack traces or internal details

### Access Controls (CC6.1)
- [ ] Authentication required for all endpoints
- [ ] Authorization checks for sensitive operations
- [ ] Role-based access for maker/checker pattern (payroll)
- [ ] API keys/tokens stored in environment variables only

### Financial Transaction Integrity (CC9.2)
- [ ] Atomic operations for multi-step transactions
- [ ] Idempotency keys for payment operations
- [ ] Duplicate detection for payments
- [ ] Reconciliation capabilities (status tracking)

### Availability & Traceability (A1.2)
- [ ] All events include `timestamp` and `request_id`
- [ ] Distributed tracing headers propagated
- [ ] Health check endpoints available
- [ ] Graceful degradation for external service failures

## Action Catalogue Verification

| Action | Required Fields | Compliance Control |
|--------|----------------|-------------------|
| `payroll.run.create` | actor, resource_id, payment_count, amount_usd | CC6.1, CC9.2 |
| `payroll.run.approve` | actor, resource_id, maker, amount_usd | CC6.1, CC9.2 |
| `jpm.payment.create` | resource_id, amount_usd | CC9.2 |
| `jpm.callback.verify` | result, error_code (if failure) | CC7.2 |

## Output Format

### Compliance Report
```markdown
## Compliance Review: <file-name>

### Status: ✅ PASS / ⚠️ NEEDS_FIX / ❌ FAIL

### Findings
1. **PII Handling**: [Status] - [Details]
2. **Audit Logging**: [Status] - [Details]
3. **Security Controls**: [Status] - [Details]
4. **Access Controls**: [Status] - [Details]

### Required Changes
- [ ] [Specific change needed]
- [ ] [Specific change needed]

### SOC 2 Controls Satisfied
- [ ] CC6.1 - Logical access controls
- [ ] CC7.2 - Security event monitoring
- [ ] CC9.2 - Financial transaction integrity
- [ ] A1.2 - Availability & traceability
```

## Remediation Template

If PII found in logs:
```typescript
// BEFORE (non-compliant)
this.logger.log('Payment processed', payment);

// AFTER (compliant)
import { maskPaymentItem } from '../common/utils/pii.util';
this.auditLogger.log({
  action: 'payment.processed',
  actor: userId,
  resource_id: payment.id,
  result: 'success',
  ...maskPaymentItem(payment),
});
```

If audit logging missing:
```typescript
// Add to service method
async performOperation(data: any, userId: string) {
  const result = await this.repository.save(data);
  
  this.auditLogger.log({
    action: '<module>.<operation>',
    actor: userId,
    resource_id: result.id,
    result: 'success',
    // Add financial fields if applicable
  });
  
  return result;
}
```

