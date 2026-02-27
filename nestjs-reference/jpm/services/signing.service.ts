// @ts-nocheck
/**
 * JPM NestJS SigningService
 *
 * Signs outbound payment request bodies using the UAT (or PROD) RSA private key.
 * Attach the returned base64 string as the `x-jpm-signature` HTTP header.
 *
 * Cert path resolution (highest → lowest priority):
 *   1. SIGNING_KEY_PATH env var (explicit override)
 *   2. JPMORGAN_ENV=production → /certs/prod/signature/private.key
 *   3. default (testing/UAT)   → /certs/uat/signature/private.key
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class SigningService implements OnModuleInit {
  private readonly logger = new Logger(SigningService.name);
  private privateKey!: Buffer;

  onModuleInit(): void {
    const keyPath = this.resolveKeyPath();
    try {
      this.privateKey = fs.readFileSync(keyPath);
      this.logger.log(`RSA signing key loaded from: ${keyPath}`);
    } catch (err: any) {
      this.logger.warn(
        `[SigningService] Could not load private key from "${keyPath}": ${err?.message}. ` +
        `Signing will be unavailable until the key is present.`
      );
    }
  }

  /** Returns true if the private key was loaded successfully. */
  isConfigured(): boolean {
    return !!this.privateKey;
  }

  /**
   * Sign a request body string using RSA-SHA256.
   * @returns Base64-encoded signature for use in `x-jpm-signature` header.
   * @throws If the private key is not loaded.
   */
  sign(body: string): string {
    if (!this.privateKey) {
      throw new Error(
        '[SigningService] Private key not loaded. Check SIGNING_KEY_PATH or cert directory.'
      );
    }
    return crypto
      .sign('RSA-SHA256', Buffer.from(body), this.privateKey)
      .toString('base64');
  }

  /** Resolved key path (for diagnostics). */
  getKeyPath(): string {
    return this.resolveKeyPath();
  }

  private resolveKeyPath(): string {
    if (process.env.SIGNING_KEY_PATH) return process.env.SIGNING_KEY_PATH;
    const base = process.env.JPMORGAN_ENV === 'production' ? '/certs/prod' : '/certs/uat';
    return `${base}/signature/private.key`;
  }
}
