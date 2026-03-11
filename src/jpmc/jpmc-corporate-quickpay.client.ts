// @ts-nocheck
// src/jpmc/jpmc-corporate-quickpay.client.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

interface CreateAchPaymentRequest {
  paymentType: 'ACH';
  companyId: string;
  debitAccount: string;
  creditAccount: {
    routingNumber: string;
    accountNumber: string;
    accountType: 'CHECKING' | 'SAVINGS';
  };
  amount: {
    currency: 'USD';
    value: string;
  };
  memo?: string;
  effectiveDate: string;
}

interface CreatePaymentResponse {
  paymentId: string;
  status: string;
}

interface GetPaymentStatusResponse {
  paymentId: string;
  status: string;
  returnCode?: string;
}

@Injectable()
export class JpmcCorporateQuickPayClient {
  private readonly logger = new Logger(JpmcCorporateQuickPayClient.name);
  private readonly http: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    const baseUrl = this.configService.get<string>('jpmc.baseUrl');
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 15000,
      // httpsAgent: new https.Agent({ cert, key, ca }) // mTLS here
    });
  }

  private async getAccessToken(): Promise<string> {
    const tokenUrl = this.configService.get<string>('jpmc.tokenUrl');
    const clientId = this.configService.get<string>('jpmc.clientId');
    const clientSecret = this.configService.get<string>('jpmc.clientSecret');

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', 'payments');

    const { data } = await axios.post(tokenUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return data.access_token;
  }

  private async authHeaders() {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async createAchPayment(
    payload: CreateAchPaymentRequest,
  ): Promise<CreatePaymentResponse> {
    const path = this.configService.get<string>('jpmc.corporateQuickPayPath');
    const headers = await this.authHeaders();

    this.logger.debug(`Creating ACH payment for ${payload.amount.value}`);

    const { data } = await this.http.post<CreatePaymentResponse>(
      path,
      payload,
      { headers },
    );

    return data;
  }

  async getPaymentStatus(paymentId: string): Promise<GetPaymentStatusResponse> {
    const path = `${this.configService.get<string>(
      'jpmc.corporateQuickPayPath',
    )}/${paymentId}`;
    const headers = await this.authHeaders();

    const { data } = await this.http.get<GetPaymentStatusResponse>(path, {
      headers,
    });

    return data;
  }
}
