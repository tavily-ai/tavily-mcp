/**
 * J.P. Morgan Embedded Payments API Integration
 *
 * Provides access to embedded finance client and account management capabilities.
 * Supports virtual transaction accounts and limited access payment accounts (Accounts v2 Beta).
 *
 * API Version: v1 (Accounts v2 Beta)
 * Docs: https://developer.payments.jpmorgan.com
 *
 * Authentication:
 *   - OAuth: Bearer token via JPMORGAN_ACCESS_TOKEN environment variable
 *
 * Environments:
 *   - Production: https://apigateway.jpmorgan.com/tsapi/v1/ef
 *   - Mock:       https://api-mock.payments.jpmorgan.com/tsapi/v1/ef
 */

import axios from 'axios';
import { isSigningConfigured, signPayloadBase64, isEncryptionConfigured, encryptPayloadBase64 } from './signing.service.js';
import { isMtlsConfigured, getMtlsAxiosConfig } from './mtls.service.js';

// ─── Server Configuration ─────────────────────────────────────────────────────

export const JPMORGAN_EMBEDDED_SERVER = {
  name: 'jpmorgan-embedded-payments',
  title: 'J.P. Morgan Embedded Payments API',
  version: 'v1',
  apiVersion: 'Accounts v2 (Beta)',
  baseUrls: {
    production: 'https://apigateway.jpmorgan.com/tsapi/v1/ef',
    mock:       'https://api-mock.payments.jpmorgan.com/tsapi/v1/ef'
  },
  resources: {
    clients:  '/clients',
    accounts: '/clients/{clientId}/accounts'
  },
  docsUrl: 'https://developer.payments.jpmorgan.com',
  env: {
    JPMORGAN_ACCESS_TOKEN: 'your-jpmorgan-oauth-access-token',
    JPMORGAN_PAYMENTS_ENV: 'production'  // 'production' | 'mock'
  }
} as const;

// ─── TypeScript Interfaces ────────────────────────────────────────────────────

/** Embedded Finance Client */
export interface EFClient {
  id?: string;
  clientId?: string;
  name?: string;
  status?: string;
  type?: string;
  email?: string;
  phone?: string;
  address?: EFAddress;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

/** Address for a client */
export interface EFAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/** Request body for creating a client */
export interface EFCreateClientRequest {
  name: string;
  type?: string;
  email?: string;
  phone?: string;
  address?: EFAddress;
  [key: string]: any;
}

/** Embedded Finance Account (Accounts v2 Beta) */
export interface EFAccount {
  id?: string;
  accountId?: string;
  clientId?: string;
  type?: string;
  status?: string;
  currency?: string;
  balance?: number;
  availableBalance?: number;
  routingNumber?: string;
  accountNumber?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

/** Paginated list response */
export interface EFListResponse<T> {
  data?: T[];
  items?: T[];
  total?: number;
  page?: number;
  limit?: number;
  hasMore?: boolean;
  [key: string]: any;
}

/** Error response from the API */
export interface EFError {
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
 * Resolve the correct base URL based on environment.
 * Defaults to production (as configured for beta prototype).
 */
function resolveBaseUrl(env: 'production' | 'mock' = 'production'): string {
  return env === 'mock'
    ? JPMORGAN_EMBEDDED_SERVER.baseUrls.mock
    : JPMORGAN_EMBEDDED_SERVER.baseUrls.production;
}

// ─── Configuration Helpers ────────────────────────────────────────────────────

/**
 * Check if J.P. Morgan Embedded Payments API is configured (OAuth token present)
 */
export function isJPMorganEmbeddedConfigured(): boolean {
  return !!process.env.JPMORGAN_ACCESS_TOKEN;
}

/**
 * Get J.P. Morgan Embedded Payments API configuration
 */
export function getJPMorganEmbeddedConfig() {
  const env = (process.env.JPMORGAN_PAYMENTS_ENV as 'production' | 'mock') || 'production';
  return {
    ...JPMORGAN_EMBEDDED_SERVER,
    configured: isJPMorganEmbeddedConfigured(),
    activeEnv: env,
    activeBaseUrl: resolveBaseUrl(env)
  };
}

/**
 * List available J.P. Morgan Embedded Payments MCP tools
 */
export function listJPMorganEmbeddedTools(): Array<{ name: string; description: string; resource: string }> {
  return [
    {
      name: 'ef_list_clients',
      description: 'List all embedded finance clients. Supports optional pagination via limit and page parameters.',
      resource: 'clients'
    },
    {
      name: 'ef_get_client',
      description: 'Get a specific embedded finance client by client ID.',
      resource: 'clients'
    },
    {
      name: 'ef_create_client',
      description: 'Create a new embedded finance client with name, type, contact details, and address.',
      resource: 'clients'
    },
    {
      name: 'ef_list_accounts',
      description: 'List all accounts for a specific embedded finance client. Supports virtual transaction accounts and limited access payment accounts (Accounts v2 Beta).',
      resource: 'accounts'
    },
    {
      name: 'ef_get_account',
      description: 'Get a specific account for an embedded finance client by account ID (Accounts v2 Beta).',
      resource: 'accounts'
    }
  ];
}

// ─── Shared Axios Helper ──────────────────────────────────────────────────────

/**
 * Result of buildRequestPayload — contains the final headers and outbound body string.
 */
interface PreparedRequest {
  headers: Record<string, string>;
  body: string;
}

/**
 * Prepare headers and body for a mutating (POST/PUT/PATCH) request.
 *
 * Security operations applied in order:
 *   1. Sign the original serialised JSON → x-jpm-signature header
 *   2. Encrypt the original serialised JSON → base64 body + Content-Type: application/octet-stream
 *
 * Both operations are optional and non-fatal: if a key file is absent or
 * unreadable the request proceeds with the plaintext body and a warning is logged.
 *
 * @param body - The request body object to serialise, sign, and/or encrypt
 */
function buildRequestPayload(body: Record<string, any>): PreparedRequest {
  const accessToken = process.env.JPMORGAN_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('JPMORGAN_ACCESS_TOKEN environment variable is not set. Please obtain an OAuth access token from the J.P. Morgan Developer Portal.');
  }

  const serialised = JSON.stringify(body);

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  // Step 1 — Sign the original plaintext
  if (isSigningConfigured()) {
    try {
      headers['x-jpm-signature'] = signPayloadBase64(serialised);
    } catch (sigErr: any) {
      console.warn(`[JPMorganEmbedded] Request signing skipped: ${sigErr?.message}`);
    }
  }

  // Step 2 — Encrypt the original plaintext (after signing so signature covers readable content)
  let outboundBody = serialised;
  if (isEncryptionConfigured()) {
    try {
      outboundBody = encryptPayloadBase64(serialised);
      headers['Content-Type'] = 'application/octet-stream';
      headers['x-jpm-encrypted'] = 'true';
    } catch (encErr: any) {
      console.warn(`[JPMorganEmbedded] Payload encryption skipped: ${encErr?.message}`);
    }
  }

  return { headers, body: outboundBody };
}

/**
 * Build read-only (GET/DELETE) auth headers — no body to sign or encrypt.
 */
function getAuthHeaders(): Record<string, string> {
  const accessToken = process.env.JPMORGAN_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('JPMORGAN_ACCESS_TOKEN environment variable is not set. Please obtain an OAuth access token from the J.P. Morgan Developer Portal.');
  }
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

function getActiveBaseUrl(): string {
  const env = (process.env.JPMORGAN_PAYMENTS_ENV as 'production' | 'mock') || 'production';
  return resolveBaseUrl(env);
}

/**
 * Return axios transport config — includes mTLS httpsAgent when configured,
 * empty object otherwise (plain HTTPS with default agent).
 */
function getTransportConfig(): Record<string, any> {
  return isMtlsConfigured() ? getMtlsAxiosConfig() : {};
}

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * List all embedded finance clients.
 * GET /clients
 */
export async function listClients(params?: {
  limit?: number;
  page?: number;
}): Promise<EFListResponse<EFClient>> {
  const headers = getAuthHeaders();
  const baseUrl = getActiveBaseUrl();
  const url = `${baseUrl}${JPMORGAN_EMBEDDED_SERVER.resources.clients}`;

  const queryParams: Record<string, any> = {};
  if (params?.limit !== undefined) queryParams.limit = params.limit;
  if (params?.page !== undefined)  queryParams.page = params.page;

  const response = await axios.get<EFListResponse<EFClient>>(url, {
    ...getTransportConfig(),
    headers,
    params: Object.keys(queryParams).length > 0 ? queryParams : undefined
  });

  return response.data;
}

/**
 * Get a specific embedded finance client by ID.
 * GET /clients/{clientId}
 */
export async function getClient(clientId: string): Promise<EFClient> {
  if (!clientId || clientId.trim() === '') {
    throw new Error('clientId is required and must not be empty.');
  }

  const headers = getAuthHeaders();
  const baseUrl = getActiveBaseUrl();
  const url = `${baseUrl}${JPMORGAN_EMBEDDED_SERVER.resources.clients}/${encodeURIComponent(clientId)}`;

  const response = await axios.get<EFClient>(url, { ...getTransportConfig(), headers });
  return response.data;
}

/**
 * Create a new embedded finance client.
 * POST /clients
 */
export async function createClient(params: EFCreateClientRequest): Promise<EFClient> {
  if (!params.name || params.name.trim() === '') {
    throw new Error('name is required to create a client.');
  }

  const baseUrl = getActiveBaseUrl();
  const url = `${baseUrl}${JPMORGAN_EMBEDDED_SERVER.resources.clients}`;

  const prepared = buildRequestPayload(params);
  const response = await axios.post<EFClient>(url, prepared.body, {
    ...getTransportConfig(),
    headers: prepared.headers
  });
  return response.data;
}

/**
 * List all accounts for a specific client (Accounts v2 Beta).
 * GET /clients/{clientId}/accounts
 */
export async function listAccounts(
  clientId: string,
  params?: { limit?: number; page?: number }
): Promise<EFListResponse<EFAccount>> {
  if (!clientId || clientId.trim() === '') {
    throw new Error('clientId is required and must not be empty.');
  }

  const headers = getAuthHeaders();
  const baseUrl = getActiveBaseUrl();
  const url = `${baseUrl}/clients/${encodeURIComponent(clientId)}/accounts`;

  const queryParams: Record<string, any> = {};
  if (params?.limit !== undefined) queryParams.limit = params.limit;
  if (params?.page !== undefined)  queryParams.page = params.page;

  const response = await axios.get<EFListResponse<EFAccount>>(url, {
    ...getTransportConfig(),
    headers,
    params: Object.keys(queryParams).length > 0 ? queryParams : undefined
  });

  return response.data;
}

/**
 * Get a specific account for a client (Accounts v2 Beta).
 * GET /clients/{clientId}/accounts/{accountId}
 */
export async function getAccount(clientId: string, accountId: string): Promise<EFAccount> {
  if (!clientId || clientId.trim() === '') {
    throw new Error('clientId is required and must not be empty.');
  }
  if (!accountId || accountId.trim() === '') {
    throw new Error('accountId is required and must not be empty.');
  }

  const headers = getAuthHeaders();
  const baseUrl = getActiveBaseUrl();
  const url = `${baseUrl}/clients/${encodeURIComponent(clientId)}/accounts/${encodeURIComponent(accountId)}`;

  const response = await axios.get<EFAccount>(url, { ...getTransportConfig(), headers });
  return response.data;
}

export default {
  JPMORGAN_EMBEDDED_SERVER,
  isJPMorganEmbeddedConfigured,
  getJPMorganEmbeddedConfig,
  listJPMorganEmbeddedTools,
  listClients,
  getClient,
  createClient,
  listAccounts,
  getAccount
};
