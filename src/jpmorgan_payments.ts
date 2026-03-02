/**
 * J.P. Morgan Payments API Integration
 *
 * Provides ACH, Wire, RTP, and Book payment initiation and status retrieval
 * via the J.P. Morgan Payments API.
 *
 * Supported payment types:
 *   - ACH  — Automated Clearing House (domestic US, batch-settled)
 *   - WIRE — Domestic / international wire transfer
 *   - RTP  — Real-Time Payments (instant, 24/7)
 *   - BOOK — Internal book transfer between J.P. Morgan accounts
 *
 * API Version: v1
 * Docs: https://developer.jpmorgan.com
 *
 * Authentication:
 *   - OAuth: Bearer token via JPMORGAN_ACCESS_TOKEN environment variable
 *   - MTLS:  Mutual TLS (requires certificate configuration)
 *
 * Environments:
 *   - Production: https://apigateway.jpmorgan.com/payments/v1
 *   - Testing:    https://apigatewayqaf.jpmorgan.com/payments/v1
 *
 * Sample ACH payload:
 * {
 *   "paymentType": "ACH",
 *   "companyId": "YOUR_ACH_COMPANY_ID",
 *   "debitAccount": "YOUR_OPERATING_ACCOUNT",
 *   "creditAccount": {
 *     "routingNumber": "021000021",
 *     "accountNumber": "123456789",
 *     "accountType": "CHECKING"
 *   },
 *   "amount": { "currency": "USD", "value": "1500.00" },
 *   "memo": "Payroll - Employee 104",
 *   "effectiveDate": "2026-03-04"
 * }
 */

import axios from 'axios';
import {
  isSigningConfigured,
  signPayloadBase64,
  isEncryptionConfigured,
  encryptPayloadBase64
} from './signing.service.js';
import { isMtlsConfigured, getMtlsAxiosConfig } from './mtls.service.js';

// ─── Server Configuration ─────────────────────────────────────────────────────

export const JPMORGAN_PAYMENTS_SERVER = {
  name: 'jpmorgan-payments-api',
  title: 'J.P. Morgan Payments API',
  version: 'v1',
  baseUrls: {
    sandbox:    'https://api-sandbox.jpmorgan.com',
    production: 'https://apigateway.jpmorgan.com',
    testing:    'https://apigatewayqaf.jpmorgan.com'
  },
  resources: {
    /** Corporate Quick Pay / ACH payment initiation endpoint */
    payment:  '/payments/v1/payment',
    payments: '/payments/v1/payments'
  },
  supportedPaymentTypes: ['ACH', 'WIRE', 'RTP', 'BOOK'] as const,
  docsUrl: 'https://developer.jpmorgan.com',
  env: {
    /** OAuth client credentials — preferred auth method */
    JPMC_BASE_URL:          'https://api-sandbox.jpmorgan.com',
    JPMC_CLIENT_ID:         'your-jpmc-client-id',
    JPMC_CLIENT_SECRET:     'your-jpmc-client-secret',
    JPMC_TOKEN_URL:         'https://api-sandbox.jpmorgan.com/oauth2/v1/token',
    JPMC_ACH_COMPANY_ID:    'your-ach-company-id',
    JPMC_ACH_DEBIT_ACCOUNT: 'your-owlban-operating-account-id',
    /** Legacy: pre-obtained bearer token (backward compat) */
    JPMORGAN_ACCESS_TOKEN:  'your-jpmorgan-oauth-access-token',
    JPMORGAN_PAYMENTS_ENV:  'sandbox'   // 'sandbox' | 'testing' | 'production'
  }
} as const;

// ─── TypeScript Interfaces ────────────────────────────────────────────────────

/** Supported payment types */
export type PaymentType = 'ACH' | 'WIRE' | 'RTP' | 'BOOK';

/** Bank account types for ACH credit accounts */
export type BankAccountType = 'CHECKING' | 'SAVINGS';

/** Payment amount with currency */
export interface PaymentAmount {
  /** ISO 4217 currency code (e.g. 'USD') */
  currency: string;
  /** Decimal string amount (e.g. '1500.00') */
  value: string;
}

/**
 * ACH / RTP credit account — external bank account identified by
 * routing number + account number.
 */
export interface ExternalCreditAccount {
  /** ABA routing number (9 digits) */
  routingNumber: string;
  /** Bank account number */
  accountNumber: string;
  /** Account type */
  accountType: BankAccountType;
  /** Optional account holder name */
  accountName?: string;
}

/**
 * Book / internal credit account — identified by J.P. Morgan account ID.
 */
export interface InternalCreditAccount {
  /** J.P. Morgan internal account ID */
  accountId: string;
  /** Optional account holder name */
  accountName?: string;
}

/** Wire-specific beneficiary details */
export interface WireBeneficiary {
  /** Beneficiary name */
  name: string;
  /** Beneficiary account number */
  accountNumber: string;
  /** Beneficiary bank routing / SWIFT / BIC */
  bankCode: string;
  /** Optional beneficiary address */
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
}

/**
 * Request body for POST /payments
 *
 * Required fields vary by paymentType:
 *   ACH  — paymentType, debitAccount, creditAccount (ExternalCreditAccount), amount, companyId
 *   WIRE — paymentType, debitAccount, creditAccount (WireBeneficiary), amount
 *   RTP  — paymentType, debitAccount, creditAccount (ExternalCreditAccount), amount
 *   BOOK — paymentType, debitAccount, creditAccount (InternalCreditAccount), amount
 */
export interface CreatePaymentRequest {
  /** Payment rail to use */
  paymentType: PaymentType;
  /** Source account ID (debit side) */
  debitAccount: string;
  /** Destination account details (debit side) */
  creditAccount: ExternalCreditAccount | InternalCreditAccount | WireBeneficiary | Record<string, any>;
  /** Payment amount */
  amount: PaymentAmount;
  /** ACH company ID (required for ACH payments) */
  companyId?: string;
  /** Payment memo / description */
  memo?: string;
  /** Requested settlement date in yyyy-MM-dd format (ACH / WIRE) */
  effectiveDate?: string;
  /** End-to-end reference ID (idempotency key) */
  endToEndId?: string;
  /** Additional pass-through fields */
  [key: string]: any;
}

/** Query parameters for GET /payments */
export interface ListPaymentsParams {
  /** Filter by payment status */
  status?: PaymentStatus;
  /** Filter by payment type */
  paymentType?: PaymentType;
  /** Start date filter (yyyy-MM-dd) */
  fromDate?: string;
  /** End date filter (yyyy-MM-dd) */
  toDate?: string;
  /** Maximum number of results to return */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

/** Payment lifecycle statuses */
export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RETURNED';

/** A single payment record returned by the API */
export interface PaymentResponse {
  /** Unique payment identifier assigned by J.P. Morgan */
  paymentId?: string;
  /** Alias for paymentId in some response shapes */
  id?: string;
  /** Current lifecycle status */
  status?: PaymentStatus | string;
  /** Payment rail used */
  paymentType?: PaymentType | string;
  /** Source account */
  debitAccount?: string;
  /** Destination account details */
  creditAccount?: Record<string, any>;
  /** Payment amount */
  amount?: PaymentAmount;
  /** ACH company ID */
  companyId?: string;
  /** Payment memo */
  memo?: string;
  /** Effective / settlement date */
  effectiveDate?: string;
  /** ISO 8601 creation timestamp */
  createdAt?: string;
  /** ISO 8601 last-updated timestamp */
  updatedAt?: string;
  /** End-to-end reference */
  endToEndId?: string;
  /** Additional fields returned by the API */
  [key: string]: any;
}

/** Paginated list of payments */
export interface ListPaymentsResponse {
  payments?: PaymentResponse[];
  data?: PaymentResponse[];
  total?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  [key: string]: any;
}

/** Error response from the Payments API */
export interface PaymentsApiError {
  errorCode?: string;
  errorMessage?: string;
  errors?: Array<{
    code: string;
    message: string;
    field?: string;
  }>;
}

// ─── Helper: Resolve Base URL ─────────────────────────────────────────────────

/**
 * Resolve the correct base URL.
 * Priority: JPMC_BASE_URL env var → environment-derived default.
 * Defaults to sandbox for safety.
 */
function resolveBaseUrl(env: 'sandbox' | 'production' | 'testing' = 'sandbox'): string {
  if (process.env.JPMC_BASE_URL) return process.env.JPMC_BASE_URL;
  if (env === 'production') return JPMORGAN_PAYMENTS_SERVER.baseUrls.production;
  if (env === 'testing')    return JPMORGAN_PAYMENTS_SERVER.baseUrls.testing;
  return JPMORGAN_PAYMENTS_SERVER.baseUrls.sandbox;
}

function getActiveBaseUrl(): string {
  const env = (process.env.JPMORGAN_PAYMENTS_ENV as 'sandbox' | 'production' | 'testing') || 'sandbox';
  return resolveBaseUrl(env);
}

// ─── OAuth Client Credentials Token Fetch ────────────────────────────────────

/**
 * Obtain a JPMC OAuth access token using the client credentials grant.
 *
 * Auth priority:
 *   1. JPMORGAN_ACCESS_TOKEN — pre-obtained bearer token (legacy / manual)
 *   2. JPMC_CLIENT_ID + JPMC_CLIENT_SECRET + JPMC_TOKEN_URL — OAuth client credentials
 *
 * @returns Bearer token string
 * @throws If neither auth method is configured
 */
async function getJpmcAccessToken(): Promise<string> {
  // Fast path: pre-obtained bearer token (legacy / manual)
  if (process.env.JPMORGAN_ACCESS_TOKEN) {
    return process.env.JPMORGAN_ACCESS_TOKEN;
  }

  const clientId     = process.env.JPMC_CLIENT_ID;
  const clientSecret = process.env.JPMC_CLIENT_SECRET;
  const tokenUrl     = process.env.JPMC_TOKEN_URL;

  if (!clientId || !clientSecret || !tokenUrl) {
    throw new Error(
      'J.P. Morgan Payments API is not configured. ' +
      'Set JPMC_CLIENT_ID + JPMC_CLIENT_SECRET + JPMC_TOKEN_URL for OAuth client credentials, ' +
      'or set JPMORGAN_ACCESS_TOKEN for a pre-obtained bearer token.'
    );
  }

  // OAuth 2.0 client credentials grant (application/x-www-form-urlencoded)
  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret
  });

  const tokenResponse = await axios.post<{ access_token: string; token_type: string }>(
    tokenUrl,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const token = tokenResponse.data?.access_token;
  if (!token) {
    throw new Error('[JPMorganPayments] OAuth token response did not contain access_token.');
  }

  return token;
}

// ─── Configuration Helpers ────────────────────────────────────────────────────

/**
 * Check if J.P. Morgan Payments API is configured.
 * Accepts either:
 *   - OAuth client credentials: JPMC_CLIENT_ID + JPMC_CLIENT_SECRET + JPMC_TOKEN_URL
 *   - Legacy bearer token:      JPMORGAN_ACCESS_TOKEN
 */
export function isJPMorganPaymentsConfigured(): boolean {
  const hasClientCredentials =
    !!process.env.JPMC_CLIENT_ID &&
    !!process.env.JPMC_CLIENT_SECRET &&
    !!process.env.JPMC_TOKEN_URL;
  return hasClientCredentials || !!process.env.JPMORGAN_ACCESS_TOKEN;
}

/**
 * Get J.P. Morgan Payments API configuration details.
 */
export function getJPMorganPaymentsConfig() {
  const env = (process.env.JPMORGAN_PAYMENTS_ENV as 'sandbox' | 'production' | 'testing') || 'sandbox';
  return {
    ...JPMORGAN_PAYMENTS_SERVER,
    configured: isJPMorganPaymentsConfigured(),
    activeEnv: env,
    activeBaseUrl: resolveBaseUrl(env),
    authMethod: (process.env.JPMC_CLIENT_ID && process.env.JPMC_CLIENT_SECRET)
      ? 'client_credentials'
      : 'bearer_token'
  };
}

/**
 * List available J.P. Morgan Payments MCP tools.
 */
export function listJPMorganPaymentsTools(): Array<{
  name: string;
  description: string;
  method: string;
  endpoint: string;
}> {
  return [
    {
      name: 'jpmorgan_create_payment',
      description: 'Initiate an ACH, Wire, RTP, or Book payment via the J.P. Morgan Payments API. Provide paymentType, debitAccount, creditAccount details, amount, and optional memo/effectiveDate.',
      method: 'POST',
      endpoint: '/payments'
    },
    {
      name: 'jpmorgan_get_payment',
      description: 'Retrieve the status and details of a specific payment by its payment ID.',
      method: 'GET',
      endpoint: '/payments/{paymentId}'
    },
    {
      name: 'jpmorgan_list_payments',
      description: 'List payments with optional filters for status, payment type, date range, and pagination.',
      method: 'GET',
      endpoint: '/payments'
    }
  ];
}

// ─── Shared Request Helpers ───────────────────────────────────────────────────

/**
 * Build auth headers for read-only (GET) requests.
 * Fetches token via OAuth client credentials if JPMC_CLIENT_ID/SECRET are set.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const accessToken = await getJpmcAccessToken();
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

/**
 * Prepare headers and body for mutating (POST/PUT/PATCH) requests.
 *
 * Auth: fetches token via OAuth client credentials (JPMC_CLIENT_ID + JPMC_CLIENT_SECRET)
 *       or falls back to JPMORGAN_ACCESS_TOKEN bearer token.
 *
 * Security pipeline (applied in order):
 *   1. Sign the original serialised JSON → x-jpm-signature header
 *   2. Encrypt the original serialised JSON → base64 body + Content-Type: application/octet-stream
 */
async function buildRequestPayload(body: Record<string, any>): Promise<{
  headers: Record<string, string>;
  body: string;
}> {
  const accessToken = await getJpmcAccessToken();
  const serialised  = JSON.stringify(body);

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  // Step 1 — Sign the original plaintext (signature covers readable content)
  if (isSigningConfigured()) {
    try {
      headers['x-jpm-signature'] = signPayloadBase64(serialised);
    } catch (sigErr: any) {
      console.warn(`[JPMorganPayments] Request signing skipped: ${sigErr?.message}`);
    }
  }

  // Step 2 — Encrypt the original plaintext after signing
  let outboundBody = serialised;
  if (isEncryptionConfigured()) {
    try {
      outboundBody = encryptPayloadBase64(serialised);
      headers['Content-Type'] = 'application/octet-stream';
      headers['x-jpm-encrypted'] = 'true';
    } catch (encErr: any) {
      console.warn(`[JPMorganPayments] Payload encryption skipped: ${encErr?.message}`);
    }
  }

  return { headers, body: outboundBody };
}

/**
 * Return axios transport config — includes mTLS httpsAgent when configured.
 */
function getTransportConfig(): Record<string, any> {
  return isMtlsConfigured() ? getMtlsAxiosConfig() : {};
}

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Initiate a payment via the J.P. Morgan Payments API.
 *
 * Supports ACH, Wire, RTP, and Book payment types.
 * The creditAccount shape varies by paymentType:
 *   - ACH / RTP  → ExternalCreditAccount (routingNumber + accountNumber + accountType)
 *   - WIRE       → WireBeneficiary (name + accountNumber + bankCode)
 *   - BOOK       → InternalCreditAccount (accountId)
 *
 * @param params - Payment creation parameters
 * @returns The created payment record with paymentId and initial status
 *
 * @example
 * // ACH payroll payment
 * await createPayment({
 *   paymentType: 'ACH',
 *   companyId: 'ACME_PAYROLL',
 *   debitAccount: '00000000000000304266256',
 *   creditAccount: {
 *     routingNumber: '021000021',
 *     accountNumber: '123456789',
 *     accountType: 'CHECKING'
 *   },
 *   amount: { currency: 'USD', value: '1500.00' },
 *   memo: 'Payroll - Employee 104',
 *   effectiveDate: '2026-03-04'
 * });
 */
export async function createPayment(
  params: CreatePaymentRequest
): Promise<PaymentResponse> {
  // ── Validation ──────────────────────────────────────────────────────────────
  if (!params.paymentType) {
    throw new Error('paymentType is required. Supported values: ACH, WIRE, RTP, BOOK.');
  }

  const validTypes: PaymentType[] = ['ACH', 'WIRE', 'RTP', 'BOOK'];
  if (!validTypes.includes(params.paymentType as PaymentType)) {
    throw new Error(
      `Invalid paymentType "${params.paymentType}". Supported values: ${validTypes.join(', ')}.`
    );
  }

  // Apply env-var defaults for debitAccount and companyId
  const debitAccount = params.debitAccount || process.env.JPMC_ACH_DEBIT_ACCOUNT || '';
  const companyId    = params.companyId    || process.env.JPMC_ACH_COMPANY_ID;

  if (!debitAccount || debitAccount.trim() === '') {
    throw new Error(
      'debitAccount is required. Provide it in the request or set JPMC_ACH_DEBIT_ACCOUNT env var.'
    );
  }

  if (!params.creditAccount || typeof params.creditAccount !== 'object') {
    throw new Error('creditAccount is required and must be an object with account details.');
  }

  if (!params.amount || !params.amount.currency || !params.amount.value) {
    throw new Error('amount is required and must include currency and value fields.');
  }

  // ACH-specific: companyId is required
  if (params.paymentType === 'ACH' && !companyId) {
    throw new Error(
      'companyId is required for ACH payments. Provide it in the request or set JPMC_ACH_COMPANY_ID env var.'
    );
  }

  // ACH / RTP: creditAccount must have routingNumber + accountNumber
  if (params.paymentType === 'ACH' || params.paymentType === 'RTP') {
    const ca = params.creditAccount as ExternalCreditAccount;
    if (!ca.routingNumber || !ca.accountNumber) {
      throw new Error(
        `creditAccount for ${params.paymentType} payments must include routingNumber and accountNumber.`
      );
    }
  }

  // BOOK: creditAccount must have accountId
  if (params.paymentType === 'BOOK') {
    const ca = params.creditAccount as InternalCreditAccount;
    if (!ca.accountId) {
      throw new Error('creditAccount for BOOK payments must include accountId.');
    }
  }

  // WIRE: creditAccount must have name + accountNumber + bankCode
  if (params.paymentType === 'WIRE') {
    const ca = params.creditAccount as WireBeneficiary;
    if (!ca.name || !ca.accountNumber || !ca.bankCode) {
      throw new Error(
        'creditAccount for WIRE payments must include name, accountNumber, and bankCode.'
      );
    }
  }

  // ── Build request body ──────────────────────────────────────────────────────
  const requestBody: Record<string, any> = {
    paymentType:   params.paymentType,
    debitAccount:  debitAccount,
    creditAccount: params.creditAccount,
    amount:        params.amount
  };

  if (companyId)            requestBody.companyId     = companyId;
  if (params.memo)          requestBody.memo          = params.memo;
  if (params.effectiveDate) requestBody.effectiveDate = params.effectiveDate;
  if (params.endToEndId)    requestBody.endToEndId    = params.endToEndId;

  // Merge any additional pass-through fields (excluding already-set keys)
  const reservedKeys = new Set([
    'paymentType', 'debitAccount', 'creditAccount', 'amount',
    'companyId', 'memo', 'effectiveDate', 'endToEndId'
  ]);
  for (const [key, value] of Object.entries(params)) {
    if (!reservedKeys.has(key) && value !== undefined) {
      requestBody[key] = value;
    }
  }

  // ── Send request — uses Corporate Quick Pay endpoint ────────────────────────
  const baseUrl = getActiveBaseUrl();
  const url     = `${baseUrl}${JPMORGAN_PAYMENTS_SERVER.resources.payment}`;
  const prepared = await buildRequestPayload(requestBody);

  const response = await axios.post<PaymentResponse>(url, prepared.body, {
    ...getTransportConfig(),
    headers: prepared.headers
  });

  return response.data;
}

/**
 * Retrieve the status and details of a specific payment by its ID.
 *
 * @param paymentId - The unique payment identifier returned by createPayment
 * @returns Full payment record including current status
 *
 * @example
 * const payment = await getPayment('PAY-20260304-001');
 * console.log(payment.status); // 'COMPLETED'
 */
export async function getPayment(paymentId: string): Promise<PaymentResponse> {
  if (!paymentId || paymentId.trim() === '') {
    throw new Error('paymentId is required and must not be empty.');
  }

  const headers = await getAuthHeaders();
  const baseUrl = getActiveBaseUrl();
  const url     = `${baseUrl}${JPMORGAN_PAYMENTS_SERVER.resources.payment}/${encodeURIComponent(paymentId)}`;

  const response = await axios.get<PaymentResponse>(url, {
    ...getTransportConfig(),
    headers
  });

  return response.data;
}

/**
 * List payments with optional filters.
 *
 * @param params - Optional filter and pagination parameters
 * @returns Paginated list of payment records
 *
 * @example
 * // List recent ACH payments
 * const result = await listPayments({
 *   paymentType: 'ACH',
 *   fromDate: '2026-03-01',
 *   toDate: '2026-03-31',
 *   limit: 20
 * });
 */
export async function listPayments(
  params?: ListPaymentsParams
): Promise<ListPaymentsResponse> {
  const headers = await getAuthHeaders();
  const baseUrl = getActiveBaseUrl();
  const url     = `${baseUrl}${JPMORGAN_PAYMENTS_SERVER.resources.payments}`;

  const queryParams: Record<string, any> = {};
  if (params?.status)      queryParams.status      = params.status;
  if (params?.paymentType) queryParams.paymentType = params.paymentType;
  if (params?.fromDate)    queryParams.fromDate    = params.fromDate;
  if (params?.toDate)      queryParams.toDate      = params.toDate;
  if (params?.limit !== undefined)  queryParams.limit  = params.limit;
  if (params?.offset !== undefined) queryParams.offset = params.offset;

  const response = await axios.get<ListPaymentsResponse>(url, {
    ...getTransportConfig(),
    headers,
    params: Object.keys(queryParams).length > 0 ? queryParams : undefined
  });

  return response.data;
}

export default {
  JPMORGAN_PAYMENTS_SERVER,
  isJPMorganPaymentsConfigured,
  getJPMorganPaymentsConfig,
  listJPMorganPaymentsTools,
  createPayment,
  getPayment,
  listPayments
};
