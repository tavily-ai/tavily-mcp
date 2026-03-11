/**
 * Mutual TLS (mTLS) Service
 *
 * Configures client certificate authentication for outbound HTTPS connections
 * to J.P. Morgan APIs that require mutual TLS at the transport layer.
 *
 * nginx equivalent:
 *   ssl_certificate        /certs/transport/client.crt;
 *   ssl_certificate_key    /certs/transport/client.key;
 *   ssl_client_certificate /certs/transport/jpm_ca_bundle.crt;
 *   ssl_verify_client      on;
 *
 * Configuration (environment variables):
 *   MTLS_CLIENT_CERT_PATH  — Path to our PEM client certificate.
 *                            Default: /certs/transport/client.crt
 *   MTLS_CLIENT_KEY_PATH   — Path to our PEM client private key.
 *                            Default: /certs/transport/client.key
 *   MTLS_CA_BUNDLE_PATH    — Path to J.P. Morgan's PEM CA bundle.
 *                            Default: /certs/transport/jpm_ca_bundle.crt
 *
 * Usage:
 *   import { isMtlsConfigured, getMtlsAxiosConfig } from './mtls.service.js';
 *
 *   const axiosConfig = isMtlsConfigured()
 *     ? { ...getMtlsAxiosConfig(), headers: { ... } }
 *     : { headers: { ... } };
 *
 *   const response = await axios.post(url, body, axiosConfig);
 */

import fs from 'fs';
import https from 'https';

// ─── Environment-aware base path ─────────────────────────────────────────────

/**
 * Resolve the certificate base directory from JPMORGAN_ENV.
 *   JPMORGAN_ENV=production  →  /certs/prod
 *   JPMORGAN_ENV=testing     →  /certs/uat  (default)
 */
function certBase(): string {
  return process.env.JPMORGAN_ENV === 'production' ? '/certs/prod' : '/certs/uat';
}

// ─── Path Resolution ──────────────────────────────────────────────────────────

/**
 * Priority: MTLS_CLIENT_CERT_PATH env var → JPMORGAN_ENV-derived default.
 */
function resolveClientCertPath(): string {
  return process.env.MTLS_CLIENT_CERT_PATH ?? `${certBase()}/transport/client.crt`;
}

/**
 * Priority: MTLS_CLIENT_KEY_PATH env var → JPMORGAN_ENV-derived default.
 */
function resolveClientKeyPath(): string {
  return process.env.MTLS_CLIENT_KEY_PATH ?? `${certBase()}/transport/client.key`;
}

/**
 * Priority: MTLS_CA_BUNDLE_PATH env var → JPMORGAN_ENV-derived default.
 */
function resolveCaBundlePath(): string {
  return process.env.MTLS_CA_BUNDLE_PATH ?? `${certBase()}/transport/jpm_ca_bundle.crt`;
}

// ─── Configuration Check ──────────────────────────────────────────────────────

/**
 * Check whether all three mTLS files (client cert, client key, CA bundle)
 * exist and are readable. All three must be present for mTLS to be active.
 */
export function isMtlsConfigured(): boolean {
  try {
    fs.accessSync(resolveClientCertPath(), fs.constants.R_OK);
    fs.accessSync(resolveClientKeyPath(),  fs.constants.R_OK);
    fs.accessSync(resolveCaBundlePath(),   fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Return mTLS configuration details (safe for logging — no key material).
 */
export function getMtlsConfig(): {
  configured: boolean;
  clientCertPath: string;
  clientKeyPath: string;
  caBundlePath: string;
} {
  return {
    configured:     isMtlsConfigured(),
    clientCertPath: resolveClientCertPath(),
    clientKeyPath:  resolveClientKeyPath(),
    caBundlePath:   resolveCaBundlePath()
  };
}

// ─── Agent Factory ────────────────────────────────────────────────────────────

/**
 * Create a Node.js `https.Agent` configured for mutual TLS.
 *
 * Mirrors the exact pattern from the J.P. Morgan integration guide:
 *
 *   const httpsAgent = new https.Agent({
 *     cert: fs.readFileSync('/certs/transport/client.crt'),
 *     key:  fs.readFileSync('/certs/transport/client.key'),
 *     ca:   fs.readFileSync('/certs/transport/jpm_ca_bundle.crt'),
 *   });
 *
 * The agent presents our client certificate to J.P. Morgan during the TLS
 * handshake, and validates J.P. Morgan's server certificate against the
 * provided CA bundle. `rejectUnauthorized` is Node's default (true).
 *
 * @returns Configured `https.Agent` instance
 * @throws If any certificate file cannot be loaded
 *
 * @example
 * const agent = createMtlsAgent();
 * const response = await axios.post(url, body, { httpsAgent: agent, headers });
 */
export function createMtlsAgent(): https.Agent {
  try {
    const cert = fs.readFileSync(resolveClientCertPath());
    const key  = fs.readFileSync(resolveClientKeyPath());
    const ca   = fs.readFileSync(resolveCaBundlePath());
    return new https.Agent({ cert, key, ca });
  } catch (err: any) {
    const path = err?.path ?? 'unknown path';
    const reason = err?.code === 'ENOENT'
      ? `File not found at "${path}". Set MTLS_CLIENT_CERT_PATH / MTLS_CLIENT_KEY_PATH / MTLS_CA_BUNDLE_PATH to the correct paths.`
      : err?.code === 'EACCES'
        ? `Permission denied reading "${path}". Check file permissions.`
        : err?.message ?? String(err);
    throw new Error(`[MtlsService] ${reason}`);
  }
}

/**
 * Return an axios-compatible config object with the mTLS `httpsAgent` set.
 * Merge this with your existing axios request config.
 *
 * @returns `{ httpsAgent: https.Agent }` ready to spread into axios options
 * @throws If any certificate file cannot be loaded
 *
 * @example
 * const response = await axios.post(url, body, {
 *   ...getMtlsAxiosConfig(),
 *   headers: requestHeaders
 * });
 */
export function getMtlsAxiosConfig(): { httpsAgent: https.Agent } {
  return { httpsAgent: createMtlsAgent() };
}

export default {
  isMtlsConfigured,
  getMtlsConfig,
  createMtlsAgent,
  getMtlsAxiosConfig
};
