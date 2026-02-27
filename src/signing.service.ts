/**
 * Digital Signing & Encryption Service
 *
 * Provides two complementary security operations for J.P. Morgan API integrations:
 *
 *   1. RSA-SHA256 SIGNING   — proves the request originated from us.
 *      Uses our RSA private key to produce a signature attached as x-jpm-signature.
 *      Config: SIGNING_KEY_PATH (default: /certs/digital-signature/private.key)
 *
 *   2. RSA PUBLIC-KEY ENCRYPTION — ensures only J.P. Morgan can read the payload.
 *      Uses J.P. Morgan's RSA public key to encrypt the request body before sending.
 *      Config: JPM_PUBLIC_KEY_PATH (default: /certs/encryption/jpm_public.pem)
 *
 *   3. INBOUND CALLBACK VERIFICATION — proves an inbound webhook/callback was sent by J.P. Morgan.
 *      Uses J.P. Morgan's callback certificate (X.509 / PEM) to verify the signature
 *      attached to the callback request body.
 *      Config: JPM_CALLBACK_CERT_PATH (default: /certs/callback/jpm_callback.crt)
 *
 * Combined outbound flow:
 *   const serialised = JSON.stringify(requestBody);
 *   if (isSigningConfigured())    headers['x-jpm-signature'] = signPayloadBase64(serialised);
 *   if (isEncryptionConfigured()) body = encryptPayloadBase64(serialised);   // send as encrypted body
 *
 * Inbound callback flow:
 *   const sig = req.headers['x-jpm-signature'];
 *   const valid = verifyCallbackSignatureBase64(req.body, sig);
 *   if (!valid) return res.status(401).send('Invalid callback signature');
 *
 * Usage:
 *   import {
 *     isSigningConfigured, signPayloadBase64,
 *     isEncryptionConfigured, encryptPayloadBase64,
 *     isCallbackVerificationConfigured, verifyCallbackSignatureBase64
 *   } from './signing.service.js';
 */

import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

// ─── Constants ────────────────────────────────────────────────────────────────

const SIGNING_ALGORITHM = 'RSA-SHA256' as const;

// ─── Environment-aware base path ─────────────────────────────────────────────

/**
 * Resolve the certificate base directory from JPMORGAN_ENV.
 *   JPMORGAN_ENV=production  →  /certs/prod
 *   JPMORGAN_ENV=testing     →  /certs/uat  (default)
 */
function certBase(): string {
  return process.env.JPMORGAN_ENV === 'production' ? '/certs/prod' : '/certs/uat';
}

// ─── Key Resolution ───────────────────────────────────────────────────────────

/**
 * Resolve the private key file path.
 * Priority: SIGNING_KEY_PATH env var → JPMORGAN_ENV-derived default.
 */
function resolveKeyPath(): string {
  return process.env.SIGNING_KEY_PATH ?? `${certBase()}/signature/private.key`;
}

/**
 * Check whether the private key file exists and is readable.
 * Does NOT validate the key format — only checks file accessibility.
 */
export function isSigningConfigured(): boolean {
  try {
    const keyPath = resolveKeyPath();
    fs.accessSync(keyPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Return signing service configuration details (safe for logging — no key material).
 */
export function getSigningConfig(): {
  configured: boolean;
  keyPath: string;
  algorithm: string;
} {
  const keyPath = resolveKeyPath();
  return {
    configured: isSigningConfigured(),
    keyPath,
    algorithm: SIGNING_ALGORITHM
  };
}

// ─── Key Loading ──────────────────────────────────────────────────────────────

/**
 * Load the private key from disk.
 * Throws a descriptive error if the file cannot be read.
 *
 * @returns PEM-encoded private key buffer
 */
function loadPrivateKey(): Buffer {
  const keyPath = resolveKeyPath();
  try {
    return fs.readFileSync(keyPath);
  } catch (err: any) {
    const reason = err?.code === 'ENOENT'
      ? `File not found at "${keyPath}". Set SIGNING_KEY_PATH to the correct path.`
      : err?.code === 'EACCES'
        ? `Permission denied reading "${keyPath}". Check file permissions.`
        : `Failed to read private key from "${keyPath}": ${err?.message ?? String(err)}`;
    throw new Error(`[SigningService] ${reason}`);
  }
}

// ─── Signing Functions ────────────────────────────────────────────────────────

/**
 * Sign a payload using RSA-SHA256 with the configured private key.
 *
 * @param payload - The data to sign (string or Buffer)
 * @returns Raw signature as a Buffer
 * @throws If the private key cannot be loaded or signing fails
 *
 * @example
 * const sig = signPayload(JSON.stringify({ accountId: '123' }));
 */
export function signPayload(payload: string | Buffer): Buffer {
  const privateKey = loadPrivateKey();
  try {
    return crypto.sign(SIGNING_ALGORITHM, Buffer.from(payload), privateKey);
  } catch (err: any) {
    throw new Error(
      `[SigningService] RSA-SHA256 signing failed: ${err?.message ?? String(err)}. ` +
      `Ensure the key at "${resolveKeyPath()}" is a valid PEM-encoded RSA private key.`
    );
  }
}

/**
 * Sign a payload using RSA-SHA256 and return the signature as a Base64 string.
 * This is the format expected by HTTP headers (e.g. x-jpm-signature).
 *
 * @param payload - The data to sign (string or Buffer)
 * @returns Base64-encoded RSA-SHA256 signature
 * @throws If the private key cannot be loaded or signing fails
 *
 * @example
 * const sig = signPayloadBase64(JSON.stringify(requestBody));
 * headers['x-jpm-signature'] = sig;
 */
export function signPayloadBase64(payload: string | Buffer): string {
  return signPayload(payload).toString('base64');
}

/**
 * Sign a payload and return the signature as a hex string.
 *
 * @param payload - The data to sign (string or Buffer)
 * @returns Hex-encoded RSA-SHA256 signature
 */
export function signPayloadHex(payload: string | Buffer): string {
  return signPayload(payload).toString('hex');
}

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Verify an RSA-SHA256 signature against a payload using a public key.
 * Useful for testing round-trips or verifying inbound signed responses.
 *
 * @param payload   - The original data that was signed
 * @param signature - The signature to verify (Buffer or base64 string)
 * @param publicKey - PEM-encoded RSA public key (Buffer or string)
 * @returns true if the signature is valid, false otherwise
 */
export function verifySignature(
  payload: string | Buffer,
  signature: Buffer | string,
  publicKey: Buffer | string
): boolean {
  try {
    const sigBuffer = typeof signature === 'string'
      ? Buffer.from(signature, 'base64')
      : signature;
    return crypto.verify(
      SIGNING_ALGORITHM,
      Buffer.from(payload),
      publicKey,
      sigBuffer
    );
  } catch {
    return false;
  }
}

// ─── Encryption: Key Resolution ───────────────────────────────────────────────

/**
 * Resolve the J.P. Morgan public key file path.
 * Priority: JPM_PUBLIC_KEY_PATH env var → JPMORGAN_ENV-derived default.
 */
function resolveJpmPublicKeyPath(): string {
  return process.env.JPM_PUBLIC_KEY_PATH ?? `${certBase()}/encryption/jpm_public.pem`;
}

/**
 * Check whether J.P. Morgan's public key file exists and is readable.
 */
export function isEncryptionConfigured(): boolean {
  try {
    fs.accessSync(resolveJpmPublicKeyPath(), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Return encryption configuration details (safe for logging — no key material).
 */
export function getEncryptionConfig(): {
  configured: boolean;
  keyPath: string;
} {
  return {
    configured: isEncryptionConfigured(),
    keyPath: resolveJpmPublicKeyPath()
  };
}

// ─── Encryption: Key Loading ──────────────────────────────────────────────────

/**
 * Load J.P. Morgan's RSA public key from disk.
 * Throws a descriptive error if the file cannot be read.
 */
function loadJpmPublicKey(): Buffer {
  const keyPath = resolveJpmPublicKeyPath();
  try {
    return fs.readFileSync(keyPath);
  } catch (err: any) {
    const reason = err?.code === 'ENOENT'
      ? `File not found at "${keyPath}". Set JPM_PUBLIC_KEY_PATH to the correct path.`
      : err?.code === 'EACCES'
        ? `Permission denied reading "${keyPath}". Check file permissions.`
        : `Failed to read JPM public key from "${keyPath}": ${err?.message ?? String(err)}`;
    throw new Error(`[EncryptionService] ${reason}`);
  }
}

// ─── Encryption Functions ─────────────────────────────────────────────────────

/**
 * Encrypt a payload using J.P. Morgan's RSA public key (OAEP padding).
 * Only J.P. Morgan — holding the corresponding private key — can decrypt this.
 *
 * Signing should be performed on the ORIGINAL plaintext before calling this
 * function, so the signature covers the readable content.
 *
 * @param data - The plaintext data to encrypt (string or Buffer)
 * @returns Encrypted payload as a raw Buffer
 * @throws If the public key cannot be loaded or encryption fails
 *
 * @example
 * const serialised = JSON.stringify(requestBody);
 * headers['x-jpm-signature'] = signPayloadBase64(serialised);   // sign first
 * const encryptedBody = encryptPayloadBase64(serialised);        // then encrypt
 */
export function encryptPayload(data: string | Buffer): Buffer {
  const jpmPublicKey = loadJpmPublicKey();
  try {
    return crypto.publicEncrypt(jpmPublicKey, Buffer.from(data));
  } catch (err: any) {
    throw new Error(
      `[EncryptionService] RSA public-key encryption failed: ${err?.message ?? String(err)}. ` +
      `Ensure the key at "${resolveJpmPublicKeyPath()}" is a valid PEM-encoded RSA public key.`
    );
  }
}

/**
 * Encrypt a payload and return the result as a Base64 string.
 * This is the format used when sending an encrypted body over HTTP.
 *
 * @param data - The plaintext data to encrypt (string or Buffer)
 * @returns Base64-encoded RSA-encrypted payload
 *
 * @example
 * const serialised = JSON.stringify(requestBody);
 * const encryptedBody = encryptPayloadBase64(serialised);
 * // Send encryptedBody as the HTTP request body with Content-Type: application/octet-stream
 */
export function encryptPayloadBase64(data: string | Buffer): string {
  return encryptPayload(data).toString('base64');
}

// ─── Callback Verification: Key Resolution ────────────────────────────────────

/**
 * Resolve the J.P. Morgan callback certificate path.
 * Priority: JPM_CALLBACK_CERT_PATH env var → JPMORGAN_ENV-derived default.
 */
function resolveJpmCallbackCertPath(): string {
  return process.env.JPM_CALLBACK_CERT_PATH ?? `${certBase()}/callback/jpm_callback.crt`;
}

/**
 * Check whether J.P. Morgan's callback certificate file exists and is readable.
 */
export function isCallbackVerificationConfigured(): boolean {
  try {
    fs.accessSync(resolveJpmCallbackCertPath(), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Return callback verification configuration details (safe for logging — no key material).
 */
export function getCallbackVerificationConfig(): {
  configured: boolean;
  certPath: string;
} {
  return {
    configured: isCallbackVerificationConfigured(),
    certPath: resolveJpmCallbackCertPath()
  };
}

// ─── Callback Verification: Certificate Loading ───────────────────────────────

/**
 * Load J.P. Morgan's callback certificate from disk.
 * Accepts both PEM-encoded X.509 certificates (.crt) and raw PEM public keys.
 * Throws a descriptive error if the file cannot be read.
 */
function loadJpmCallbackCert(): Buffer {
  const certPath = resolveJpmCallbackCertPath();
  try {
    return fs.readFileSync(certPath);
  } catch (err: any) {
    const reason = err?.code === 'ENOENT'
      ? `File not found at "${certPath}". Set JPM_CALLBACK_CERT_PATH to the correct path.`
      : err?.code === 'EACCES'
        ? `Permission denied reading "${certPath}". Check file permissions.`
        : `Failed to read JPM callback certificate from "${certPath}": ${err?.message ?? String(err)}`;
    throw new Error(`[CallbackVerification] ${reason}`);
  }
}

// ─── Callback Verification Functions ─────────────────────────────────────────

/**
 * Verify an inbound J.P. Morgan callback/webhook signature using their certificate.
 *
 * J.P. Morgan signs the raw request body with their private key and attaches the
 * signature to the callback request (typically as x-jpm-signature header).
 * This function verifies that signature using their published callback certificate.
 *
 * @param body      - The raw callback request body (string or Buffer)
 * @param signature - The signature to verify (raw Buffer)
 * @returns true if the signature is valid and the callback originated from J.P. Morgan
 * @throws If the certificate cannot be loaded
 *
 * @example
 * const valid = verifyCallbackSignature(req.rawBody, sigBuffer);
 * if (!valid) throw new Error('Callback signature verification failed');
 */
export function verifyCallbackSignature(
  body: string | Buffer,
  signature: Buffer
): boolean {
  const cert = loadJpmCallbackCert();
  try {
    return crypto.verify(
      SIGNING_ALGORITHM,
      Buffer.from(body),
      cert,
      signature
    );
  } catch {
    return false;
  }
}

/**
 * Verify an inbound J.P. Morgan callback/webhook signature where the signature
 * is provided as a Base64-encoded string (as typically found in HTTP headers).
 *
 * @param body            - The raw callback request body (string or Buffer)
 * @param signatureBase64 - The Base64-encoded signature from the callback header
 * @returns true if the signature is valid and the callback originated from J.P. Morgan
 * @throws If the certificate cannot be loaded
 *
 * @example
 * const sig = req.headers['x-jpm-signature'];
 * const valid = verifyCallbackSignatureBase64(req.rawBody, sig);
 * if (!valid) return res.status(401).send('Invalid callback signature');
 */
export function verifyCallbackSignatureBase64(
  body: string | Buffer,
  signatureBase64: string
): boolean {
  const sigBuffer = Buffer.from(signatureBase64, 'base64');
  return verifyCallbackSignature(body, sigBuffer);
}

export default {
  isSigningConfigured,
  getSigningConfig,
  signPayload,
  signPayloadBase64,
  signPayloadHex,
  verifySignature,
  isEncryptionConfigured,
  getEncryptionConfig,
  encryptPayload,
  encryptPayloadBase64,
  isCallbackVerificationConfigured,
  getCallbackVerificationConfig,
  verifyCallbackSignature,
  verifyCallbackSignatureBase64
};
