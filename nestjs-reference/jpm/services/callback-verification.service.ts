// @ts-nocheck
/**
 * JPM NestJS CallbackVerificationService
 *
 * Verifies inbound JPM webhook (callback) signatures using JPM's callback certificate.
 * Call verify() inside your webhook controller before processing any callback payload.
 *
 * Cert path resolution (highest → lowest priority):
 *   1. JPM_CALLBACK_CERT_PATH env var (explicit override)
 *   2. JPMORGAN_ENV=production → /certs/prod/callback/jpm_callback.crt
 *   3. default (testing/UAT)   → /certs/uat/callback/jpm_callback.crt
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class CallbackVerificationService implements OnModuleInit {
  private readonly logger = new Logger(CallbackVerificationService.name);
  private jpmCallbackCert!: Buffer;

  onModuleInit(): void {
    const certPath = this.resolveCertPath();
    try {
      this.jpmCallbackCert = fs.readFileSync(certPath);
      this.logger.log(`JPM callback certificate loaded from: ${certPath}`);
    } catch (err: any) {
      this.logger.warn(
        `[CallbackVerificationService] Could not load JPM callback cert from "${certPath}": ${err?.message}. ` +
        `Callback verification will be unavailable until the cert is present.`
      );
    }
  }

  /** Returns true if the JPM callback certificate was loaded successfully. */
  isConfigured(): boolean {
    return !!this.jpmCallbackCert;
  }

  /**
   * Verify a JPM webhook signature against the raw request body.
   *
   * @param body      - Raw request body as a Buffer (use express raw-body middleware)
   * @param signature - Base64-encoded RSA-SHA256 signature from `x-jpm-signature` header
   * @returns true if the signature is valid, false otherwise
   * @throws If the JPM callback certificate is not loaded
   *
   * @example
   * // In your NestJS webhook controller:
   * const rawBody: Buffer = req.rawBody;
   * const sig = req.headers['x-jpm-signature'] as string;
   * const valid = this.callbackVerificationService.verify(rawBody, sig);
   * if (!valid) throw new UnauthorizedException('Invalid JPM callback signature');
   */
  verify(body: Buffer, signature: string): boolean {
    if (!this.jpmCallbackCert) {
      throw new Error(
        '[CallbackVerificationService] JPM callback cert not loaded. Check JPM_CALLBACK_CERT_PATH or cert directory.'
      );
    }
    try {
      return crypto.verify(
        'RSA-SHA256',
        body,
        this.jpmCallbackCert,
        Buffer.from(signature, 'base64')
      );
    } catch {
      return false;
    }
  }

  /**
   * Verify a JPM webhook signature against a string body.
   * Convenience wrapper — converts the string to a Buffer before verifying.
   */
  verifyString(body: string, signature: string): boolean {
    return this.verify(Buffer.from(body), signature);
  }

  /** Resolved cert path (for diagnostics). */
  getCertPath(): string {
    return this.resolveCertPath();
  }

  private resolveCertPath(): string {
    if (process.env.JPM_CALLBACK_CERT_PATH) return process.env.JPM_CALLBACK_CERT_PATH;
    const base = process.env.JPMORGAN_ENV === 'production' ? '/certs/prod' : '/certs/uat';
    return `${base}/callback/jpm_callback.crt`;
  }
}
