// @ts-nocheck
/**
 * pii.util.ts — PII masking utilities for SOC 2–compliant logging.
 *
 * All financial identifiers MUST be masked before they appear in any log line,
 * error message, or structured audit event.  Raw values must never leave the
 * service boundary in log output.
 *
 * Masking rules
 * ─────────────
 *   accountNumber   → "****<last4>"          e.g. "****6789"
 *   routingNumber   → "****<last4>"          e.g. "****5678"
 *   employeeName    → "<First initial>. <Last initial>."  e.g. "J. D."
 *   employeeId      → kept as-is (internal opaque ID, not PII)
 *   amount          → kept as-is (required for audit trail)
 *   effectiveDate   → kept as-is (not PII)
 *
 * Usage:
 *   import { maskAccount, maskRouting, maskName, maskPaymentItem } from '../common/utils/pii.util';
 *
 *   logger.log({ account: maskAccount(payment.accountNumber) });
 */

/**
 * Mask a bank account number, retaining only the last 4 digits.
 * Returns '****' if the value is absent or shorter than 4 characters.
 *
 * @example maskAccount('123456789') → '****6789'
 */
export function maskAccount(accountNumber: string | undefined | null): string {
  if (!accountNumber || accountNumber.length < 4) return '****';
  return `****${accountNumber.slice(-4)}`;
}

/**
 * Mask an ABA routing number, retaining only the last 4 digits.
 * Returns '****' if the value is absent or shorter than 4 characters.
 *
 * @example maskRouting('021000021') → '****0021'
 */
export function maskRouting(routingNumber: string | undefined | null): string {
  if (!routingNumber || routingNumber.length < 4) return '****';
  return `****${routingNumber.slice(-4)}`;
}

/**
 * Reduce a full employee name to initials only.
 * Splits on whitespace; each word contributes its first character followed by '.'.
 * Returns '**' if the value is absent.
 *
 * @example maskName('Jane Doe')        → 'J. D.'
 * @example maskName('Mary Ann Smith')  → 'M. A. S.'
 */
export function maskName(fullName: string | undefined | null): string {
  if (!fullName?.trim()) return '**';
  return fullName
    .trim()
    .split(/\s+/)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(' ');
}

/**
 * Mask an OAuth / Bearer token, retaining only the last 6 characters.
 * Returns '******' if the value is absent or shorter than 6 characters.
 *
 * @example maskToken('eyJhbGciOiJSUzI1NiJ9.abc') → '******.abc'
 */
export function maskToken(token: string | undefined | null): string {
  if (!token || token.length < 6) return '******';
  return `******${token.slice(-6)}`;
}

/**
 * Produce a log-safe summary of a single payroll payment item.
 * All PII fields are masked; non-PII fields are kept verbatim.
 */
export interface MaskedPaymentSummary {
  employeeId:    string;
  employeeName:  string;   // masked to initials
  accountLast4:  string;   // masked account number
  routingLast4:  string;   // masked routing number
  accountType:   string;
  amount:        number;
  effectiveDate: string;
}

export function maskPaymentItem(item: {
  employeeId:    string;
  employeeName:  string;
  accountNumber: string;
  routingNumber: string;
  accountType:   string;
  amount:        number;
  effectiveDate: string;
}): MaskedPaymentSummary {
  return {
    employeeId:   item.employeeId,
    employeeName: maskName(item.employeeName),
    accountLast4: maskAccount(item.accountNumber),
    routingLast4: maskRouting(item.routingNumber),
    accountType:  item.accountType,
    amount:       item.amount,
    effectiveDate: item.effectiveDate,
  };
}
