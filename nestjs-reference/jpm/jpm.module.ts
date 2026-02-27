// @ts-nocheck
//
// JPM NestJS Module
//
// Drop this module (and the files in services/, providers/, controllers/) into
// your NestJS project, then import JpmModule into your AppModule.
//
// Required npm packages (add to your NestJS project):
//   npm install @nestjs/common @nestjs/core axios
//   npm install --save-dev @types/node
//
// Required environment variables:
//   JPMORGAN_ACCESS_TOKEN   - OAuth Bearer token
//   JPMORGAN_ENV            - 'testing' (default) | 'production'
//
// Optional cert override env vars (override the JPMORGAN_ENV-derived defaults):
//   SIGNING_KEY_PATH        - RSA private key for request signing
//   JPM_PUBLIC_KEY_PATH     - JPM RSA public key for payload encryption
//   JPM_CALLBACK_CERT_PATH  - JPM certificate for callback verification
//   MTLS_CLIENT_CERT_PATH   - mTLS client certificate
//   MTLS_CLIENT_KEY_PATH    - mTLS client private key
//   MTLS_CA_BUNDLE_PATH     - JPM CA bundle for mTLS
//
// Required cert files (UAT Standard - place under /certs/uat/):
//   /certs/uat/signature/private.key
//   /certs/uat/encryption/jpm_public.pem
//   /certs/uat/callback/jpm_callback.crt
//   /certs/uat/transport/client.crt
//   /certs/uat/transport/client.key
//   /certs/uat/transport/jpm_ca_bundle.crt
//
// main.ts - add raw body middleware for callback verification:
//   app.use('/jpm/callbacks', express.raw({ type: 'application/json' }));

import { Module } from '@nestjs/common';
import { SigningService } from './services/signing.service';
import { EncryptionService } from './services/encryption.service';
import { CallbackVerificationService } from './services/callback-verification.service';
import { JpmHttpService } from './services/jpm-http.service';
import { JpmClientProvider } from './providers/jpm-client.provider';
import { JpmPaymentController } from './controllers/jpm-payment.controller';

@Module({
  controllers: [JpmPaymentController],
  providers: [
    SigningService,
    EncryptionService,
    CallbackVerificationService,
    JpmHttpService,
    JpmClientProvider,
  ],
  exports: [
    SigningService,
    EncryptionService,
    CallbackVerificationService,
    JpmHttpService,
    JpmClientProvider,
  ],
})
export class JpmModule {}
