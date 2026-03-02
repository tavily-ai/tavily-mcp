// src/config/jpmc.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('jpmc', () => ({
  baseUrl: process.env.JPMC_BASE_URL ?? 'https://api-sandbox.jpmorgan.com',
  clientId: process.env.JPMC_CLIENT_ID,
  clientSecret: process.env.JPMC_CLIENT_SECRET,
  tokenUrl: process.env.JPMC_TOKEN_URL,
  corporateQuickPayPath: '/payments/v1/payment',
  companyId: process.env.JPMC_ACH_COMPANY_ID,
  debitAccount: process.env.JPMC_ACH_DEBIT_ACCOUNT,
}));
