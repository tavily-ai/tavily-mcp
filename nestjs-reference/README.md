# JPM UAT Standard — NestJS Reference Module

Ready-to-paste NestJS module for J.P. Morgan Embedded Payments (UAT Standard).
Wires all four security operations — digital signing, payload encryption, callback
verification, and outbound mTLS transport — into a single injectable module.

---

## File structure

```text
nestjs-reference/jpm/
  jpm.module.ts                          ← import this into AppModule
  services/
    signing.service.ts                   ← RSA-SHA256 outbound request signing
    encryption.service.ts                ← RSA/OAEP public-key payload encryption
    callback-verification.service.ts     ← inbound webhook signature verification
    jpm-http.service.ts                  ← injectable Axios client (optional mTLS)
    jpmc-corporate-quickpay.client.ts    ← ACH payment initiation + status retrieval
  providers/
    jpm-client.provider.ts               ← legacy factory provider (JPM_CLIENT token)
  controllers/
    jpm-payment.controller.ts            ← POST /jpm/payments + /jpm/callbacks/payment
```

---

## Installation (in your NestJS project)

```bash
npm install @nestjs/common @nestjs/core @nestjs/config axios
npm install --save-dev @types/node
```

---

## Required cert files

Place under `/certs/uat/` (UAT) or `/certs/prod/` (production):

```text
/certs
  /uat
    /signature
      private.key          ← your RSA private key (digital signature)
    /encryption
      jpm_public.pem       ← JPM's RSA public key (payload encryption)
    /callback
      jpm_callback.crt     ← JPM's callback certificate (webhook verification)
    /transport
      client.crt           ← your mTLS client certificate
      client.key           ← your mTLS client private key
      jpm_ca_bundle.crt    ← JPM's CA bundle
  /prod
    ...                    ← same structure, production certs
```

---

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `JPMORGAN_ACCESS_TOKEN` | Yes* | OAuth Bearer token (legacy / manual) |
| `JPMORGAN_ENV` | No | `testing` (default) or `production` |
| `JPMC_BASE_URL` | No | API base URL (default: `https://api-sandbox.jpmorgan.com`) |
| `JPMC_CLIENT_ID` | Yes* | OAuth client ID for `JpmcCorporateQuickPayClient` |
| `JPMC_CLIENT_SECRET` | Yes* | OAuth client secret for `JpmcCorporateQuickPayClient` |
| `JPMC_TOKEN_URL` | Yes* | OAuth token endpoint for `JpmcCorporateQuickPayClient` |
| `JPMC_ACH_COMPANY_ID` | No | Default ACH company ID |
| `JPMC_ACH_DEBIT_ACCOUNT` | No | Default debit (source) account ID |
| `SIGNING_KEY_PATH` | No | Override default signing key path |
| `JPM_PUBLIC_KEY_PATH` | No | Override default encryption key path |
| `JPM_CALLBACK_CERT_PATH` | No | Override default callback cert path |
| `MTLS_CLIENT_CERT_PATH` | No | Override default mTLS client cert path |
| `MTLS_CLIENT_KEY_PATH` | No | Override default mTLS client key path |
| `MTLS_CA_BUNDLE_PATH` | No | Override default CA bundle path |

\* `JPMORGAN_ACCESS_TOKEN` is used by `JpmHttpService` / `JpmPaymentController`.
`JPMC_CLIENT_ID` + `JPMC_CLIENT_SECRET` + `JPMC_TOKEN_URL` are used by `JpmcCorporateQuickPayClient` (OAuth client credentials grant).

---

## Usage

### 1. Import JpmModule into AppModule

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { JpmModule } from './jpm/jpm.module';

@Module({
  imports: [JpmModule],
})
export class AppModule {}
```

### 2. Add raw body middleware for callback verification

```typescript
// main.ts
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use('/jpm/callbacks', express.raw({ type: 'application/json' }));
  await app.listen(3000);
}
bootstrap();
```

### 3. Inject services into your own controllers/services

#### Option A — `JpmcCorporateQuickPayClient` (ACH payments, OAuth client credentials)

Use this service for ACH payment initiation and status retrieval. It handles
OAuth token fetching automatically using `ConfigService`.

```typescript
import { Injectable } from '@nestjs/common';
import { JpmcCorporateQuickPayClient } from './jpm/services/jpmc-corporate-quickpay.client';

@Injectable()
export class PayrollService {
  constructor(
    private readonly quickPay: JpmcCorporateQuickPayClient,
  ) {}

  async disbursePayroll(employee: {
    routingNumber: string;
    accountNumber: string;
    netPay: string;
    name: string;
  }) {
    // Initiate ACH payment
    const payment = await this.quickPay.createAchPayment({
      paymentType:   'ACH',
      companyId:     'ACME_PAYROLL',
      debitAccount:  '00000000000000304266256',
      creditAccount: {
        routingNumber: employee.routingNumber,
        accountNumber: employee.accountNumber,
        accountType:   'CHECKING',
      },
      amount:        { currency: 'USD', value: employee.netPay },
      memo:          `Payroll - ${employee.name}`,
      effectiveDate: '2026-03-04',
    });

    // Poll for status
    const status = await this.quickPay.getPaymentStatus(payment.paymentId);
    if (status.status === 'RETURNED') {
      throw new Error(`Payment returned: ${status.returnCode}`);
    }

    return payment.paymentId;
  }
}
```

#### Option B — `JpmHttpService` (sign + encrypt pipeline, legacy Bearer token)

Use `JpmHttpService` for outbound calls that require the full sign → encrypt pipeline:

```typescript
import { Injectable } from '@nestjs/common';
import { SigningService } from './jpm/services/signing.service';
import { EncryptionService } from './jpm/services/encryption.service';
import { JpmHttpService } from './jpm/services/jpm-http.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly signer: SigningService,
    private readonly encryptor: EncryptionService,
    private readonly jpm: JpmHttpService,
  ) {}

  async sendPayment(payload: Record<string, unknown>) {
    const encrypted = this.encryptor.encrypt(payload);
    const signature = this.signer.sign(encrypted);

    return this.jpm.getClient().post('/payments', encrypted, {
      headers: {
        'Authorization': `Bearer ${process.env.JPMORGAN_ACCESS_TOKEN ?? ''}`,
        'x-jpm-signature': signature,
        'Content-Type': 'application/octet-stream',
        'x-jpm-encrypted': 'true',
      },
    });
  }
}
```

---

## Outbound request pipeline

```text
serialised = JSON.stringify(requestBody)

1. signing.isConfigured()     → headers['x-jpm-signature'] = signing.sign(serialised)
2. encryption.isConfigured()  → body = encryption.encrypt(dto)
                                 headers['Content-Type'] = 'application/octet-stream'
                                 headers['x-jpm-encrypted'] = 'true'
3. jpmHttp.isMtlsConfigured() → httpsAgent attached (client cert TLS handshake)
                                 base URL switches to mTLS gateway automatically
```

---

## Service comparison

| Service | Auth method | Use case | Injection |
| --- | --- | --- | --- |
| `JpmcCorporateQuickPayClient` | OAuth client credentials (auto) | ACH payment initiation + status | `private readonly quickPay: JpmcCorporateQuickPayClient` |
| `JpmHttpService` | Bearer token (manual) | Sign + encrypt pipeline | `private readonly jpm: JpmHttpService` |
| `JpmClientProvider` | Bearer token (manual) | Legacy factory provider | `@Inject(JPM_CLIENT) private readonly jpmClient: AxiosInstance` |

**Recommended:** Use `JpmcCorporateQuickPayClient` for new ACH payment work.
Use `JpmHttpService` when you need the full sign → encrypt → mTLS pipeline.
`JpmClientProvider` is kept for backward compatibility only.

---

## Switching to production

Set `JPMORGAN_ENV=production` — all cert paths switch to `/certs/prod/...` automatically.
No code changes required.

---

## API Gateway mTLS (Nginx example)

If you terminate TLS at a gateway instead of in NestJS, the transport cert files
(`client.crt`, `client.key`, `jpm_ca_bundle.crt`) are not required. `JpmHttpService`
detects their absence and falls back to OAuth-only transport automatically.

To configure your gateway instead:

```nginx
server {
    listen 443 ssl;
    server_name jpm-proxy.yourdomain.com;

    ssl_certificate        /certs/uat/transport/client.crt;
    ssl_certificate_key    /certs/uat/transport/client.key;
    ssl_client_certificate /certs/uat/transport/jpm_ca_bundle.crt;
    ssl_verify_client      on;

    location / {
        proxy_pass https://api-sandbox.jpmorgan.com;
        proxy_set_header Host api-sandbox.jpmorgan.com;
    }
}
```

---

## Metrics & Observability (Prometheus + Grafana Alloy)

### Overview

`MetricsModule` is a `@Global()` NestJS module that wires Prometheus metrics,
SOC 2 audit logging, and global HTTP instrumentation into every module that
imports it (or into the whole app when imported once in `AppModule`).

### Installation

```bash
npm install prom-client
```

### AppModule integration

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MetricsModule } from './metrics/metrics.module';
import { JpmModule }     from './jpm/jpm.module';
import { PayrollModule } from './payroll/payroll.module';

@Module({
  imports: [MetricsModule, JpmModule, PayrollModule],
})
export class AppModule {}
```

### main.ts — global filter + validation

```typescript
import { NestFactory }      from '@nestjs/core';
import { ValidationPipe }   from '@nestjs/common';
import { AppModule }        from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global DTO validation (required by PayrollModule DTOs)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Raw body middleware for JPM callback signature verification
  const express = await import('express');
  app.use('/jpm/callbacks', express.raw({ type: 'application/json' }));

  await app.listen(3000);
}
bootstrap();
```

> `AllExceptionsFilter`, `HttpMetricsInterceptor`, and `AuditLogInterceptor` are
> registered automatically via `APP_FILTER` / `APP_INTERCEPTOR` tokens inside
> `MetricsModule` — no manual `useGlobalFilters` / `useGlobalInterceptors` call needed.

### Prometheus scrape endpoint

`MetricsController` exposes `GET /metrics` in the standard Prometheus text
exposition format. Configure Grafana Alloy to scrape it:

```yaml
# alloy/config.alloy (River syntax)
prometheus.scrape "nestjs" {
  targets = [{ __address__ = "localhost:3000" }]
  forward_to = [prometheus.remote_write.default.receiver]
  metrics_path = "/metrics"
  scrape_interval = "15s"
}
```

### Metric catalogue

| Metric | Type | Labels | Description |
| --- | --- | --- | --- |
| `http_requests_total` | Counter | `method`, `route`, `status_code` | All inbound HTTP requests |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | HTTP request latency |
| `http_errors_total` | Counter | `method`, `route`, `status_code` | HTTP 4xx + 5xx responses |
| `payroll_runs_created_total` | Counter | `env` | Payroll runs created (DRAFT) |
| `payroll_runs_approved_total` | Counter | `env` | Payroll runs approved by checker |
| `payroll_runs_submitted_total` | Counter | `status`, `env` | Payroll runs submitted to JPMC |
| `payroll_run_amount_usd` | Histogram | — | Distribution of run totals (USD) |
| `payroll_payments_total` | Counter | `status`, `env` | Individual payments by JPMC status |
| `payroll_jpmc_api_duration_seconds` | Histogram | `operation` | JPMC API latency during payroll |
| `jpm_api_calls_total` | Counter | `operation`, `status` | Outbound JPMC API calls |
| `jpm_api_duration_seconds` | Histogram | `operation` | Outbound JPMC API latency |
| `jpm_callback_verifications_total` | Counter | `result` | Inbound webhook verifications |

---

## SOC 2 Audit Logging

### Audit event format

`AuditLoggerService` emits newline-delimited JSON (NDJSON) audit events to
`stdout` so that Grafana Alloy / Loki / any log aggregator can ingest them.

Every event is structured as:

```json
{
  "level":       "audit",
  "timestamp":   "2025-01-15T10:30:00.000Z",
  "request_id":  "550e8400-e29b-41d4-a716-446655440000",
  "actor":       "alice@example.com",
  "action":      "payroll.run.approve",
  "resource_id": "run-uuid-here",
  "result":      "success",
  "maker":       "bob@example.com",
  "payment_count": 12,
  "amount_usd":  45000
}
```

### Action catalogue

| Action | Actor | Trigger |
| --- | --- | --- |
| `payroll.run.create` | maker user ID | `POST /payroll/runs` |
| `payroll.run.approve` | checker user ID | `POST /payroll/runs/:id/approve` |
| `payroll.run.refresh_status` | `system` | `POST /payroll/runs/:id/refresh-status` |
| `jpm.payment.create` | `system` | `POST /jpm/payments` |
| `jpm.callback.verify` | `jpm-webhook` | `POST /jpm/callbacks/payment` |

### SOC 2 controls satisfied

| Control | Requirement | Implementation |
| --- | --- | --- |
| CC6.1 | Logical access controls | Every action logged with `actor` + `resource_id` |
| CC7.2 | Security event monitoring | Auth failures logged with `result=failure` + `error_code` |
| CC9.2 | Financial transaction integrity | Payroll events include `amount_usd` + `payment_count` |
| A1.2 | Availability & traceability | All events include `timestamp` + `request_id` |

### PII masking

All account numbers and routing numbers are masked before being written to audit
logs. The `maskPaymentItem` helper in `common/utils/pii.util.ts` replaces the
last N digits with `*` characters:

```typescript
// Input:  { accountNumber: '123456789', routingNumber: '021000021', ... }
// Output: { accountNumber: '****6789',  routingNumber: '*****0021', ... }
```

Never pass raw `PayrollPayment` objects to `audit.log()` — always call
`maskPaymentItem(payment)` first.

### Loki query examples

```logql
# All audit events for a specific payroll run
{app="nestjs"} | json | level="audit" | resource_id="<run-uuid>"

# All failed operations in the last hour
{app="nestjs"} | json | level="audit" | result="failure" | __error__=""

# Payroll approvals by checker
{app="nestjs"} | json | level="audit" | action="payroll.run.approve"
  | line_format "{{.actor}} approved {{.resource_id}} — ${{.amount_usd}}"
```
