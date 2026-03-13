// @ts-nocheck
/**
 * JPM Axios Client Provider
 *
 * Creates a pre-configured Axios instance for outbound JPM API calls.
 * When mTLS cert files are present, attaches an https.Agent with the UAT (or PROD)
 * client certificate, private key, and JPM CA bundle.
 *
 * If you terminate TLS at an API Gateway (Nginx / ALB / Kong), NestJS does NOT need
 * transport certs — remove the httpsAgent block and use a plain axios.create().
 *
 * Cert path resolution (highest → lowest priority):
 *   1. MTLS_CLIENT_CERT_PATH / MTLS_CLIENT_KEY_PATH / MTLS_CA_BUNDLE_PATH env vars
 *   2. JPMORGAN_ENV=production → /certs/prod/transport/
 *   3. default (testing/UAT)   → /certs/uat/transport/
 *
 * Inject as: @Inject(JPM_CLIENT) private readonly jpmClient: AxiosInstance
 */

import * as fs from 'fs';
import * as https from 'https';
import axios, { AxiosInstance } from 'axios';
import { Provider, Logger } from '@nestjs/common';

export const JPM_CLIENT = 'JPM_CLIENT';

const logger = new Logger('JpmClientProvider');

function certBase(): string {
  return process.env.JPMORGAN_ENV === 'production' ? '/certs/prod' : '/certs/uat';
}

function resolveClientCertPath(): string {
  return process.env.MTLS_CLIENT_CERT_PATH ?? `${certBase()}/transport/client.crt`;
}

function resolveClientKeyPath(): string {
  return process.env.MTLS_CLIENT_KEY_PATH ?? `${certBase()}/transport/client.key`;
}

function resolveCaBundlePath(): string {
  return process.env.MTLS_CA_BUNDLE_PATH ?? `${certBase()}/transport/jpm_ca_bundle.crt`;
}

function isMtlsConfigured(): boolean {
  try {
    fs.accessSync(resolveClientCertPath(), fs.constants.R_OK);
    fs.accessSync(resolveClientKeyPath(), fs.constants.R_OK);
    fs.accessSync(resolveCaBundlePath(), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function createMtlsAgent(): https.Agent {
  return new https.Agent({
    cert: fs.readFileSync(resolveClientCertPath()),
    key:  fs.readFileSync(resolveClientKeyPath()),
    ca:   fs.readFileSync(resolveCaBundlePath()),
  });
}

/** Base URL selection: mTLS → MTLS gateway, OAuth → OAuth gateway */
function resolveBaseUrl(): string {
  const env = process.env.JPMORGAN_ENV === 'production' ? 'prod' : 'uat';
  if (isMtlsConfigured()) {
    return env === 'prod'
      ? 'https://apigateway.jpmorgan.com/tsapi/v1/ef'
      : 'https://apigatewayqaf.jpmorgan.com/tsapi/v1/ef';
  }
  return env === 'prod'
    ? 'https://apigateway.jpmorgan.com/tsapi/v1/ef'
    : 'https://api-mock.payments.jpmorgan.com/tsapi/v1/ef';
}

export const JpmClientProvider: Provider = {
  provide: JPM_CLIENT,
  useFactory: (): AxiosInstance => {
    const baseURL = resolveBaseUrl();
    const config: Record<string, unknown> = { baseURL };

    if (isMtlsConfigured()) {
      config.httpsAgent = createMtlsAgent();
      logger.log(`JPM client: mTLS enabled → ${baseURL}`);
    } else {
      logger.warn('JPM client: mTLS certs not found — using OAuth-only transport.');
      logger.log(`JPM client: OAuth transport → ${baseURL}`);
    }

    return axios.create(config);
  },
};
