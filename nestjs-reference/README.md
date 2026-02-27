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
  providers/
    jpm-client.provider.ts               ← legacy factory provider (JPM_CLIENT token)
  controllers/
    jpm-payment.controller.ts            ← POST /jpm/payments + /jpm/callbacks/payment
```

---

## Installation (in your NestJS project)

```bash
npm install @nestjs/common @nestjs/core axios
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
| `JPMORGAN_ACCESS_TOKEN` | Yes | OAuth Bearer token |
| `JPMORGAN_ENV` | No | `testing` (default) or `production` |
| `SIGNING_KEY_PATH` | No | Override default signing key path |
| `JPM_PUBLIC_KEY_PATH` | No | Override default encryption key path |
| `JPM_CALLBACK_CERT_PATH` | No | Override default callback cert path |
| `MTLS_CLIENT_CERT_PATH` | No | Override default mTLS client cert path |
| `MTLS_CLIENT_KEY_PATH` | No | Override default mTLS client key path |
| `MTLS_CA_BUNDLE_PATH` | No | Override default CA bundle path |

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

Use `JpmHttpService` for outbound calls — no injection token required:

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

## JpmHttpService vs JpmClientProvider

| | `JpmHttpService` | `JpmClientProvider` |
| --- | --- | --- |
| Injection | `private readonly jpm: JpmHttpService` | `@Inject(JPM_CLIENT) private readonly jpmClient: AxiosInstance` |
| Pattern | Standard `@Injectable()` service | NestJS factory provider with custom token |
| Recommended | ✅ Yes | Legacy — kept for backward compatibility |

Both are exported from `JpmModule` and behave identically at runtime.

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
