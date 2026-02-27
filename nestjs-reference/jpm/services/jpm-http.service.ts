// @ts-nocheck
/**
 * JPM NestJS JpmHttpService
 *
 * Injectable Axios client for outbound JPM API calls.
 * Replaces the factory-provider / JPM_CLIENT token pattern with a standard
 * @Injectable() service that can be injected anywhere in your NestJS app.
 *
 * mTLS behaviour:
 *   - When all three transport cert files are readable, an https.Agent is
 *     attached automatically and the request is routed to the mTLS gateway.
 *   - When certs are absent (e.g. gateway terminates TLS), a plain Axios
 *     instance is created and a warning is logged.
 *
 * Cert path resolution (highest → lowest priority):
 *   1. MTLS_CLIENT_CERT_PATH / MTLS_CLIENT_KEY_PATH / MTLS_CA_BUNDLE_PATH env vars
 *   2. JPMORGAN_ENV=production → /certs/prod/transport/
 *   3. default (testing/UAT)   → /certs/uat/transport/
 *
 * Base URL resolution:
 *   - mTLS present  → apigateway(qaf).jpmorgan.com/tsapi/v1/ef
 *   - OAuth only    → api-mock.payments.jpmorgan.com/tsapi/v1/ef  (UAT)
 *                     apigateway.jpmorgan.com/tsapi/v1/ef          (PROD)
 *
 * Usage:
 *   constructor(private readonly jpm: JpmHttpService) {}
 *   await this.jpm.getClient().post('/payments', body, { headers });
 */

import * as fs from 'fs';
import * as https from 'https';
import axios, { AxiosInstance } from 'axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class JpmHttpService implements OnModuleInit {
  private readonly logger = new Logger(JpmHttpService.name);
  private client!: AxiosInstance;

  onModuleInit(): void {
    const baseURL = this.resolveBaseUrl();
    const config: Record<string, unknown> = { baseURL, timeout: 10_000 };

    if (this.isMtlsConfigured()) {
      try {
        config.httpsAgent = new https.Agent({
          cert: fs.readFileSync(this.resolveClientCertPath()),
          key:  fs.readFileSync(this.resolveClientKeyPath()),
          ca:   fs.readFileSync(this.resolveCaBundlePath()),
          rejectUnauthorized: true,
        });
        this.logger.log(`JPM HTTP client: mTLS enabled → ${baseURL}`);
      } catch (err: any) {
        this.logger.warn(
          `[JpmHttpService] Failed to load mTLS certs: ${err?.message}. ` +
          `Falling back to OAuth-only transport.`
        );
      }
    } else {
      this.logger.warn(
        'JPM HTTP client: mTLS certs not found — using OAuth-only transport.'
      );
      this.logger.log(`JPM HTTP client: OAuth transport → ${baseURL}`);
    }

    this.client = axios.create(config);
  }

  /**
   * Returns the pre-configured Axios instance.
   * Attach Authorization, x-jpm-signature, etc. in the calling service.
   */
  getClient(): AxiosInstance {
    return this.client;
  }

  /** Returns true if all three mTLS transport cert files are readable. */
  isMtlsConfigured(): boolean {
    try {
      fs.accessSync(this.resolveClientCertPath(), fs.constants.R_OK);
      fs.accessSync(this.resolveClientKeyPath(), fs.constants.R_OK);
      fs.accessSync(this.resolveCaBundlePath(), fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private certBase(): string {
    return process.env.JPMORGAN_ENV === 'production' ? '/certs/prod' : '/certs/uat';
  }

  private resolveClientCertPath(): string {
    return process.env.MTLS_CLIENT_CERT_PATH ?? `${this.certBase()}/transport/client.crt`;
  }

  private resolveClientKeyPath(): string {
    return process.env.MTLS_CLIENT_KEY_PATH ?? `${this.certBase()}/transport/client.key`;
  }

  private resolveCaBundlePath(): string {
    return process.env.MTLS_CA_BUNDLE_PATH ?? `${this.certBase()}/transport/jpm_ca_bundle.crt`;
  }

  private resolveBaseUrl(): string {
    const isProd = process.env.JPMORGAN_ENV === 'production';
    if (this.isMtlsConfigured()) {
      return isProd
        ? 'https://apigateway.jpmorgan.com/tsapi/v1/ef'
        : 'https://apigatewayqaf.jpmorgan.com/tsapi/v1/ef';
    }
    return isProd
      ? 'https://apigateway.jpmorgan.com/tsapi/v1/ef'
      : 'https://api-mock.payments.jpmorgan.com/tsapi/v1/ef';
  }
}
