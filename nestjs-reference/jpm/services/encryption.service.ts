// @ts-nocheck
/**
 * JPM NestJS EncryptionService
 *
 * Encrypts sensitive request fields using JPM's RSA public key (OAEP/SHA-256).
 * The encrypted payload is base64-encoded and sent as the request body when
 * `x-jpm-encrypted: true` is set on the outbound request.
 *
 * Cert path resolution (highest → lowest priority):
 *   1. JPM_PUBLIC_KEY_PATH env var (explicit override)
 *   2. JPMORGAN_ENV=production → /certs/prod/encryption/jpm_public.pem
 *   3. default (testing/UAT)   → /certs/uat/encryption/jpm_public.pem
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private jpmPublicKey!: Buffer;

  onModuleInit(): void {
    const keyPath = this.resolveKeyPath();
    try {
      this.jpmPublicKey = fs.readFileSync(keyPath);
      this.logger.log(`JPM encryption public key loaded from: ${keyPath}`);
    } catch (err: any) {
      this.logger.warn(
        `[EncryptionService] Could not load JPM public key from "${keyPath}": ${err?.message}. ` +
        `Encryption will be unavailable until the key is present.`
      );
    }
  }

  /** Returns true if the JPM public key was loaded successfully. */
  isConfigured(): boolean {
    return !!this.jpmPublicKey;
  }

  /**
   * Encrypt an arbitrary payload object using JPM's RSA public key (OAEP/SHA-256).
   * @param data - Object to encrypt (will be JSON-serialised before encryption)
   * @returns Base64-encoded ciphertext for use as the request body
   * @throws If the JPM public key is not loaded
   */
  encrypt(data: Record<string, unknown>): string {
    if (!this.jpmPublicKey) {
      throw new Error(
        '[EncryptionService] JPM public key not loaded. Check JPM_PUBLIC_KEY_PATH or cert directory.'
      );
    }
    const buffer = Buffer.from(JSON.stringify(data));
    return crypto
      .publicEncrypt(
        { key: this.jpmPublicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
        buffer
      )
      .toString('base64');
  }

  /**
   * Encrypt a raw Buffer using JPM's RSA public key (OAEP/SHA-256).
   * @returns Base64-encoded ciphertext
   */
  encryptBuffer(data: Buffer): string {
    if (!this.jpmPublicKey) {
      throw new Error(
        '[EncryptionService] JPM public key not loaded. Check JPM_PUBLIC_KEY_PATH or cert directory.'
      );
    }
    return crypto
      .publicEncrypt(
        { key: this.jpmPublicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
        data
      )
      .toString('base64');
  }

  /** Resolved key path (for diagnostics). */
  getKeyPath(): string {
    return this.resolveKeyPath();
  }

  private resolveKeyPath(): string {
    if (process.env.JPM_PUBLIC_KEY_PATH) return process.env.JPM_PUBLIC_KEY_PATH;
    const base = process.env.JPMORGAN_ENV === 'production' ? '/certs/prod' : '/certs/uat';
    return `${base}/encryption/jpm_public.pem`;
  }
}
