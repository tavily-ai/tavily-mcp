# Security Audit Skill

## Description
Perform security audits on code changes, focusing on SOC 2 compliance, PII handling, authentication, and secure coding practices.

## When to Use
- Before major releases
- After significant code changes
- When adding new integrations
- Periodic security reviews
- Responding to security incidents

## Prerequisites
- Access to source code
- Understanding of SOC 2 requirements
- Knowledge of PII handling rules
- Familiarity with authentication patterns

## Steps

### 1. PII Handling Audit

Check all files for PII exposure:

```bash
# Search for potential PII in logs
grep -r "accountNumber\|routingNumber\|ssn\|taxId" --include="*.ts" src/ nestjs-reference/

# Check for console.log or logger calls
grep -r "console.log\|logger.log\|logger.debug" --include="*.ts" src/ nestjs-reference/ | grep -v "maskPaymentItem"

# Verify PII masking is applied
grep -r "maskPaymentItem" --include="*.ts" nestjs-reference/
```

**Requirements:**
- Account numbers: mask all but last 4 digits
- Routing numbers: mask all but last 4 digits
- No SSNs, tax IDs, or personal identifiers in logs
- Use `maskPaymentItem()` before audit logging

### 2. Authentication & Authorization Audit

```bash
# Check for missing AuthGuard
grep -r "@Controller" --include="*.ts" nestjs-reference/ | while read line; do
  file=$(echo $line | cut -d: -f1)
  if ! grep -q "@UseGuards" "$file"; then
    echo "Missing guards in: $file"
  fi
done

# Check for hardcoded credentials
grep -r "password\|secret\|key" --include="*.ts" src/ | grep -v "process.env" | grep -v "config"
```

**Requirements:**
- All controllers have `@UseGuards(AuthGuard)`
- No hardcoded credentials
- API keys in environment variables only
- Proper role-based access for sensitive operations

### 3. Input Validation Audit

```bash
# Check DTO validation
grep -r "class-validator\|@IsString\|@IsNumber" --include="*.ts" nestjs-reference/

# Check for raw body usage without validation
grep -r "@Body()" --include="*.ts" nestjs-reference/ | grep -v "ValidationPipe"
```

**Requirements:**
- All inputs validated with `class-validator`
- DTOs used for all request bodies
- SQL injection prevention (parameterized queries)
- XSS prevention (output encoding)

### 4. Error Handling Audit

```bash
# Check error responses
grep -r "throw new" --include="*.ts" nestjs-reference/ | head -20

# Check exception filters
grep -r "AllExceptionsFilter\|Catch" --include="*.ts" nestjs-reference/
```

**Requirements:**
- No stack traces in error responses
- No sensitive data in error messages
- Consistent error format
- Proper HTTP status codes

### 5. Certificate & mTLS Audit

```bash
# Check certificate handling
grep -r "private.key\|client.crt\|ca_bundle" --include="*.ts" nestjs-reference/

# Check mTLS configuration
grep -r "mtls\|mTLS\|httpsAgent" --include="*.ts" nestjs-reference/
```

**Requirements:**
- Certificates loaded from environment-configured paths
- No hardcoded certificate data
- mTLS properly configured for production
- Certificate validation enabled

### 6. Audit Logging Audit

```bash
# Check audit logging coverage
grep -r "auditLogger.log\|AuditLoggerService" --include="*.ts" nestjs-reference/

# Check for financial operations without audit logs
grep -r "payment\|transfer\|payroll" --include="*.ts" nestjs-reference/payroll/ | grep -v "auditLogger"
```

**Requirements:**
- All financial operations have audit logs
- Audit logs include actor, resource_id, result
- PII masked before logging
- Timestamps in ISO 8601 format

## Security Checklist

### Critical (Must Fix)
- [ ] No raw PII in logs
- [ ] No hardcoded credentials
- [ ] Authentication on all sensitive endpoints
- [ ] Input validation on all inputs
- [ ] Audit logging for financial operations

### High (Should Fix)
- [ ] Error messages don't expose internals
- [ ] Rate limiting on API endpoints
- [ ] HTTPS for all external calls
- [ ] Certificate validation
- [ ] SQL injection prevention

### Medium (Nice to Have)
- [ ] Security headers
- [ ] CORS configuration
- [ ] Request size limits
- [ ] Timeout configurations
- [ ] Dependency vulnerability scanning

## Audit Report Template

```markdown
# Security Audit Report

**Date:** YYYY-MM-DD
**Auditor:** [Name]
**Scope:** [Files/Modules reviewed]

## Executive Summary
- Critical Issues: [N]
- High Issues: [N]
- Medium Issues: [N]
- Overall Risk: [LOW/MEDIUM/HIGH/CRITICAL]

## Findings

### 1. [Issue Title] - [CRITICAL/HIGH/MEDIUM]
**Location:** `file.ts:line`
**Description:** [What was found]
**Impact:** [Security impact]
**Recommendation:** [How to fix]
**Status:** [OPEN/IN_PROGRESS/FIXED]

### 2. ...

## Compliance Status
- [ ] CC6.1 - Logical access controls
- [ ] CC7.2 - Security event monitoring
- [ ] CC9.2 - Financial transaction integrity
- [ ] A1.2 - Availability & traceability

## Remediation Plan
1. [Action item with owner and deadline]
2. [Action item with owner and deadline]

## Sign-off
- [ ] Security Team
- [ ] Engineering Lead
- [ ] Compliance Officer
```

## Automated Security Checks

### npm audit
```bash
# Check for vulnerable dependencies
npm audit

# Fix automatically
npm audit fix

# Check for high/critical only
npm audit --audit-level=high
```

### CodeQL (GitHub)
Enable in repository settings for:
- SQL injection detection
- XSS detection
- Hardcoded credentials
- Insecure randomness

### Secret Scanning
Enable GitHub secret scanning to detect:
- API keys
- Private keys
- OAuth tokens
- Database connection strings

## Output
- Security audit report
- List of findings with severity
- Remediation plan
- Compliance status

## References
- `nestjs-reference/common/utils/pii.util.ts` - PII masking
- `nestjs-reference/common/logger/audit-logger.service.ts` - Audit logging
- `nestjs-reference/common/filters/all-exceptions.filter.ts` - Error handling
- `nestjs-reference/jpm/services/` - Security service examples

