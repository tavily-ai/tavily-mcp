// @ts-nocheck
/**
 * JPMC Corporate QuickPay Client (NestJS Reference Implementation)
 *
 * Injectable NestJS service for initiating ACH payments and retrieving payment
 * status via the J.P. Morgan Corporate QuickPay API.
 *
 * ─── Integration ──────────────────────────────────────────────────────────────
 * Register in your NestJS module:
 *
 *   @Module({
 *     imports: [
 *       ConfigModule.forFeature(registerAs('jpmc', jpmcConfig)),
 *     ],
 *     providers: [JpmcCorporateQuickPayClient],
 *     exports:   [JpmcCorporateQuickPayClient],
 *   })
 *   export class JpmModule {}
 *
 * Or import JpmModule (which already exports this service) into your AppModule.
 *
 * ─── Configuration ────────────────────────────────────────────────────────────
 * Reads from the 'jpmc' config namespace (see src/config/jpmc.config.ts):
 *
 *   jpmc.baseUrl              → JPMC_BASE_URL env var (default: sandbox)
 *   jpmc.tokenUrl             → JPMC_TOKEN_URL env var
 *   jpmc.clientId             → JPMC_CLIENT_ID env var
 *   jpmc.clientSecret         → JPMC_CLIENT_SECRET env var
 *   jpmc.corporateQuickPayPath → '/payments/v1/payment' (hardcoded default)
 *
 * ─── Required environment variables ──────────────────────────────────────────
 *   JPMC_BASE_URL        Base URL (default: https://api-sandbox.jpmorgan.com)
 *   JPMC_CLIENT_ID       OAuth client ID
 *   JPMC_CLIENT_SECRET   OAuth client secret
 *   JPMC_TOKEN_URL       OAuth token endpoint URL
 *
 * ─── Optional ─────────────────────────────────────────────────────────────────
 *   JPMC_ACH_COMPANY_ID      Default ACH company ID
 *   JPMC_ACH_DEBIT_ACCOUNT   Default debit account ID
 *
 * ─── mTLS ─────────────────────────────────────────────────────────────────────
 * Uncomment the httpsAgent block in the constructor to enable mutual TLS.
 * Provide client cert, key, and CA bundle via https.Agent options.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────────
 *   @Injectable()
 *   export class PayrollService {
 *     constructor(private readonly quickPay: JpmcCorporateQuickPayClient) {}
 *
 *     async disburse(employee: Employee) {
 *       const payment = await this.quickPay.createAchPayment({
 *         paymentType:   'ACH',
 *         companyId:     'ACME_PAYROLL',
 *         debitAccount:  '00000000000000304266256',
 *         creditAccount: {
 *           routingNumber: employee.routingNumber,
 *           accountNumber: employee.accountNumber,
 *           accountType:   'CHECKING',
 *         },
 *         amount:        { currency: 'USD', value: employee.netPay },
 *         memo:          `Payroll - ${employee.name}`,
 *         effectiveDate: '2026-03-04',
 *       });
 *       return payment.paymentId;
 *     }
 *   }
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

// ─── Request / Response Interfaces ───────────────────────────────────────────

/**
 * Request body for creating an ACH payment via Corporate QuickPay.
 *
 * Required fields:
 *   paymentType, companyId, debitAccount, creditAccount, amount, effectiveDate
 *
 * Optional fields:
 *   memo
 */
export interface CreateAchPaymentRequest {
  /** Must be 'ACH' for Corporate QuickPay ACH payments. */
  paymentType: 'ACH';
  /** ACH company ID registered with J.P. Morgan. */
  companyId: string;
  /** Source account ID (debit side — your operating account). */
  debitAccount: string;
  /** Destination bank account details (credit side). */
  creditAccount: {
    /** ABA routing number (9 digits). */
    routingNumber: string;
    /** Beneficiary bank account number. */
    accountNumber: string;
    /** Account type — CHECKING or SAVINGS. */
    accountType: 'CHECKING' | 'SAVINGS';
  };
  /** Payment amount. */
  amount: {
    /** ISO 4217 currency code — must be 'USD' for ACH. */
    currency: 'USD';
    /** Decimal string amount (e.g. '1500.00'). */
    value: string;
  };
  /** Optional payment memo / description (visible on bank statement). */
  memo?: string;
  /** Requested settlement date in yyyy-MM-dd format. */
  effectiveDate: string;
}

/**
 * Response returned by POST /payments/v1/payment.
 */
export interface CreatePaymentResponse {
  /** Unique payment identifier assigned by J.P. Morgan. */
  paymentId: string;
  /** Initial payment lifecycle status (e.g. 'PENDING', 'PROCESSING'). */
  status: string;
}

/**
 * Response returned by GET /payments/v1/payment/{paymentId}.
 */
export interface GetPaymentStatusResponse {
  /** Unique payment identifier. */
  paymentId: string;
  /** Current payment lifecycle status. */
  status: string;
  /**
   * ACH return code if the payment was returned by the receiving bank.
   * Present only when status is 'RETURNED'.
   * @example 'R01' (insufficient funds), 'R02' (account closed)
   */
  returnCode?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class JpmcCorporateQuickPayClient {
  private readonly logger = new Logger(JpmcCorporateQuickPayClient.name);

  /**
   * Pre-configured Axios instance.
   * Base URL and timeout are set from config at construction time.
   * mTLS httpsAgent can be attached here when mutual TLS is required.
   */
  private readonly http: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    const baseUrl =
      this.configService.get<string>('jpmc.baseUrl') ??
      'https://api-sandbox.jpmorgan.com';

    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 15_000,
      // ── mTLS (uncomment when transport certs are available) ──────────────
      // httpsAgent: new https.Agent({
      //   cert: fs.readFileSync(process.env.MTLS_CLIENT_CERT_PATH),
      //   key:  fs.readFileSync(process.env.MTLS_CLIENT_KEY_PATH),
      //   ca:   fs.readFileSync(process.env.MTLS_CA_BUNDLE_PATH),
      //   rejectUnauthorized: true,
      // }),
    });

    this.logger.log(`JpmcCorporateQuickPayClient initialised → ${baseUrl}`);
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Obtain a JPMC OAuth access token using the client credentials grant.
   *
   * Reads credentials from the 'jpmc' config namespace:
   *   jpmc.tokenUrl, jpmc.clientId, jpmc.clientSecret
   *
   * @returns Bearer token string
   * @throws If any required credential is missing or the token request fails
   */
  private async getAccessToken(): Promise<string> {
    const tokenUrl     = this.configService.get<string>('jpmc.tokenUrl');
    const clientId     = this.configService.get<string>('jpmc.clientId');
    const clientSecret = this.configService.get<string>('jpmc.clientSecret');

    if (!tokenUrl || !clientId || !clientSecret) {
      throw new Error(
        '[JpmcCorporateQuickPayClient] OAuth credentials not configured. ' +
        'Set JPMC_TOKEN_URL, JPMC_CLIENT_ID, and JPMC_CLIENT_SECRET.'
      );
    }

    const params = new URLSearchParams();
    params.append('grant_type',    'client_credentials');
    params.append('client_id',     clientId);
    params.append('client_secret', clientSecret);
    params.append('scope',         'payments');

    const { data } = await axios.post<{ access_token: string }>(
      tokenUrl,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (!data?.access_token) {
      throw new Error(
        '[JpmcCorporateQuickPayClient] OAuth token response did not contain access_token.'
      );
    }

    return data.access_token;
  }

  /**
   * Build standard authorization headers for outbound API requests.
   * Fetches a fresh OAuth token on every call.
   *
   * @returns Headers object with Authorization and Content-Type
   */
  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Initiate an ACH payment via the J.P. Morgan Corporate QuickPay API.
   *
   * Endpoint: POST {jpmc.corporateQuickPayPath}
   * Default path: /payments/v1/payment
   *
   * @param payload - ACH payment creation parameters
   * @returns Created payment record with paymentId and initial status
   *
   * @example
   * const result = await this.quickPay.createAchPayment({
   *   paymentType:   'ACH',
   *   companyId:     'ACME_PAYROLL',
   *   debitAccount:  '00000000000000304266256',
   *   creditAccount: {
   *     routingNumber: '021000021',
   *     accountNumber: '123456789',
   *     accountType:   'CHECKING',
   *   },
   *   amount:        { currency: 'USD', value: '1500.00' },
   *   memo:          'Payroll - Employee 104',
   *   effectiveDate: '2026-03-04',
   * });
   * console.log(result.paymentId); // 'PAY-20260304-001'
   */
  async createAchPayment(
    payload: CreateAchPaymentRequest,
  ): Promise<CreatePaymentResponse> {
    const path = this.configService.get<string>('jpmc.corporateQuickPayPath')
      ?? '/payments/v1/payment';
    const headers = await this.authHeaders();

    this.logger.debug(
      `Creating ACH payment: amount=${payload.amount.value} ${payload.amount.currency}, ` +
      `effectiveDate=${payload.effectiveDate}`
    );

    const { data } = await this.http.post<CreatePaymentResponse>(
      path,
      payload,
      { headers },
    );

    this.logger.log(
      `ACH payment created: paymentId=${data.paymentId}, status=${data.status}`
    );

    return data;
  }

  /**
   * Retrieve the current status of a payment by its ID.
   *
   * Endpoint: GET {jpmc.corporateQuickPayPath}/{paymentId}
   * Default path: /payments/v1/payment/{paymentId}
   *
   * @param paymentId - The unique payment identifier returned by createAchPayment
   * @returns Payment status record, including returnCode if the payment was returned
   *
   * @example
   * const status = await this.quickPay.getPaymentStatus('PAY-20260304-001');
   * if (status.status === 'RETURNED') {
   *   console.warn(`Payment returned: ${status.returnCode}`);
   * }
   */
  async getPaymentStatus(paymentId: string): Promise<GetPaymentStatusResponse> {
    if (!paymentId || paymentId.trim() === '') {
      throw new Error(
        '[JpmcCorporateQuickPayClient] paymentId is required and must not be empty.'
      );
    }

    const basePath = this.configService.get<string>('jpmc.corporateQuickPayPath')
      ?? '/payments/v1/payment';
    const path    = `${basePath}/${encodeURIComponent(paymentId)}`;
    const headers = await this.authHeaders();

    this.logger.debug(`Fetching payment status: paymentId=${paymentId}`);

    const { data } = await this.http.get<GetPaymentStatusResponse>(path, {
      headers,
    });

    this.logger.debug(
      `Payment status: paymentId=${data.paymentId}, status=${data.status}` +
      (data.returnCode ? `, returnCode=${data.returnCode}` : '')
    );

    return data;
  }
}
