/**
 * J.P. Morgan Account Balances API Integration
 *
 * Provides access to real-time and historical account balances for J.P. Morgan accounts.
 * Supports flexible queries by date range or relative date (CURRENT_DAY / PRIOR_DAY).
 *
 * OpenAPI Spec: Account Balances API v1.0.5
 * Docs: https://developer.jpmorgan.com
 *
 * Authentication:
 *   - OAuth: Bearer token via JPMORGAN_ACCESS_TOKEN environment variable
 *   - MTLS: Mutual TLS (requires certificate configuration)
 *
 * Environments:
 *   - Production OAuth:       https://openbanking.jpmorgan.com/accessapi
 *   - Production MTLS:        https://apigateway.jpmorgan.com/accessapi
 *   - Client Testing OAuth:   https://openbankinguat.jpmorgan.com/accessapi
 *   - Client Testing MTLS:    https://apigatewayqaf.jpmorgan.com/accessapi
 */

import axios from 'axios';

// ─── Server Configuration ─────────────────────────────────────────────────────

export const JPMORGAN_API_SERVER = {
  name: 'jpmorgan-account-balances-api',
  title: 'J.P. Morgan Account Balances API',
  version: '1.0.5',
  baseUrls: {
    productionOAuth: 'https://openbanking.jpmorgan.com/accessapi',
    productionMTLS:  'https://apigateway.jpmorgan.com/accessapi',
    testingOAuth:    'https://openbankinguat.jpmorgan.com/accessapi',
    testingMTLS:     'https://apigatewayqaf.jpmorgan.com/accessapi'
  },
  endpoint: '/balance',
  authTypes: ['oauth', 'mtls'] as const,
  env: {
    JPMORGAN_ACCESS_TOKEN: 'your-jpmorgan-oauth-access-token',
    JPMORGAN_ENV: 'testing'  // 'testing' | 'production'
  }
} as const;

// ─── TypeScript Interfaces ────────────────────────────────────────────────────

/** A single account entry in the request */
export interface JPMorganAccountEntry {
  /** Account ID (e.g. '00000000000000304266256') */
  accountId: string;
}

/** Request body for POST /balance */
export interface JPMorganBalanceRequest {
  /** Start date in yyyy-MM-dd format (use with endDate, not relativeDateType) */
  startDate?: string;
  /** End date in yyyy-MM-dd format (use with startDate, not relativeDateType) */
  endDate?: string;
  /** Relative date type — mutually exclusive with startDate/endDate */
  relativeDateType?: 'CURRENT_DAY' | 'PRIOR_DAY';
  /** List of accounts to query */
  accountList: JPMorganAccountEntry[];
}

/** Currency details in the response */
export interface JPMorganCurrency {
  code: string;
  currencySequence: number;
  decimalLocation: number;
  description: string;
}

/** A single balance record for a given date */
export interface JPMorganBalance {
  /** Timestamp of when the system was notified about the transaction */
  asOfDate: string;
  recordTimestamp: string;
  currentDay: boolean;
  openingAvailableAmount: number;
  openingLedgerAmount: number;
  endingAvailableAmount: number;
  endingLedgerAmount: number;
}

/** A single account in the response */
export interface JPMorganAccount {
  accountId: string;
  accountName: string;
  branchId: string;
  bankId: string;
  bankName: string;
  currency: JPMorganCurrency;
  balanceList: JPMorganBalance[];
}

/** Full response from POST /balance */
export interface JPMorganBalanceResponse {
  accountList: JPMorganAccount[];
}

/** Error response from the API */
export interface JPMorganError {
  errors: Array<{
    errorCode: string;
    errorMsg: string;
  }>;
}

// ─── Helper: Resolve Base URL ─────────────────────────────────────────────────

/**
 * Resolve the correct base URL based on environment and auth type.
 * Defaults to Client Testing + OAuth for safety.
 */
function resolveBaseUrl(
  env: 'production' | 'testing' = 'testing',
  authType: 'oauth' | 'mtls' = 'oauth'
): string {
  if (env === 'production') {
    return authType === 'mtls'
      ? JPMORGAN_API_SERVER.baseUrls.productionMTLS
      : JPMORGAN_API_SERVER.baseUrls.productionOAuth;
  }
  return authType === 'mtls'
    ? JPMORGAN_API_SERVER.baseUrls.testingMTLS
    : JPMORGAN_API_SERVER.baseUrls.testingOAuth;
}

// ─── Configuration Helpers ────────────────────────────────────────────────────

/**
 * Check if J.P. Morgan API is configured (OAuth token present)
 */
export function isJPMorganConfigured(): boolean {
  return !!process.env.JPMORGAN_ACCESS_TOKEN;
}

/**
 * Get J.P. Morgan API configuration
 */
export function getJPMorganConfig() {
  const env = (process.env.JPMORGAN_ENV as 'production' | 'testing') || 'testing';
  const authType = 'oauth';
  return {
    ...JPMORGAN_API_SERVER,
    configured: isJPMorganConfigured(),
    activeEnv: env,
    activeAuthType: authType,
    activeBaseUrl: resolveBaseUrl(env, authType)
  };
}

/**
 * List available J.P. Morgan MCP tools
 */
export function listJPMorganTools(): Array<{ name: string; description: string }> {
  return [
    {
      name: 'retrieve_balances',
      description: 'Retrieve real-time or historical account balances for one or more J.P. Morgan accounts. Supports date range queries (startDate + endDate) or relative date queries (CURRENT_DAY / PRIOR_DAY).'
    }
  ];
}

// ─── API Call ─────────────────────────────────────────────────────────────────

/**
 * Retrieve account balances from J.P. Morgan Account Balances API.
 *
 * Supports two query modes:
 *   1. Date range: provide startDate + endDate (max 31 days apart)
 *   2. Relative date: provide relativeDateType = 'CURRENT_DAY' or 'PRIOR_DAY'
 *
 * @param params - Balance request parameters
 * @param env - Target environment: 'testing' (default) or 'production'
 * @returns Balance response with account and balance details
 *
 * @example
 * // Query by date range
 * await retrieveBalances({
 *   startDate: '2024-01-01',
 *   endDate: '2024-01-05',
 *   accountList: [{ accountId: '00000000000000304266256' }]
 * });
 *
 * @example
 * // Query current day balance
 * await retrieveBalances({
 *   relativeDateType: 'CURRENT_DAY',
 *   accountList: [{ accountId: '00000000000000304266256' }]
 * });
 */
export async function retrieveBalances(
  params: JPMorganBalanceRequest,
  env: 'production' | 'testing' = 'testing'
): Promise<JPMorganBalanceResponse> {
  const accessToken = process.env.JPMORGAN_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('JPMORGAN_ACCESS_TOKEN environment variable is not set. Please obtain an OAuth access token from J.P. Morgan Developer Portal.');
  }

  // Validate: relativeDateType is mutually exclusive with startDate/endDate
  if (params.relativeDateType && (params.startDate || params.endDate)) {
    throw new Error('relativeDateType cannot be combined with startDate or endDate. Use one or the other.');
  }

  // Validate: accountList must not be empty
  if (!params.accountList || params.accountList.length === 0) {
    throw new Error('accountList must contain at least one account ID.');
  }

  const baseUrl = resolveBaseUrl(env, 'oauth');
  const url = `${baseUrl}${JPMORGAN_API_SERVER.endpoint}`;

  // Build request body — only include defined fields
  const requestBody: Record<string, any> = {
    accountList: params.accountList
  };
  if (params.startDate)        requestBody.startDate = params.startDate;
  if (params.endDate)          requestBody.endDate = params.endDate;
  if (params.relativeDateType) requestBody.relativeDateType = params.relativeDateType;

  const response = await axios.post<JPMorganBalanceResponse>(url, requestBody, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  });

  return response.data;
}

export default {
  JPMORGAN_API_SERVER,
  isJPMorganConfigured,
  getJPMorganConfig,
  listJPMorganTools,
  retrieveBalances
};
