// @ts-nocheck
/**
 * JPM NestJS Payment Controller (reference implementation)
 *
 * Wires SigningService, EncryptionService, CallbackVerificationService,
 * and the JPM Axios client together into a payment controller.
 *
 * Routes:
 *   POST /jpm/payments          — Create a payment (sign → encrypt → send)
 *   POST /jpm/callbacks/payment — Receive a JPM webhook (verify → process)
 *
 * Prerequisites in main.ts:
 *   app.use('/jpm/callbacks', express.raw({ type: 'application/json' }));
 *   // Raw body middleware is required for callback signature verification.
 */

import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { SigningService } from '../services/signing.service';
import { EncryptionService } from '../services/encryption.service';
import { CallbackVerificationService } from '../services/callback-verification.service';
import { JpmHttpService } from '../services/jpm-http.service';
import { MetricsService } from '../../metrics/metrics.service';
import { AuditLoggerService } from '../../common/logger/audit-logger.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreatePaymentDto {
  amount: number;
  currency: string;
  debtorAccountId: string;
  creditorAccountId: string;
  reference?: string;
  [key: string]: unknown;
}

export interface JpmCallbackPayload {
  eventType: string;
  paymentId: string;
  status: string;
  [key: string]: unknown;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('jpm')
export class JpmPaymentController {
  private readonly logger = new Logger(JpmPaymentController.name);

  constructor(
    private readonly signingService: SigningService,
    private readonly encryptionService: EncryptionService,
    private readonly callbackVerificationService: CallbackVerificationService,
    private readonly jpmHttp: JpmHttpService,
    private readonly metrics: MetricsService,
    private readonly audit: AuditLoggerService,
  ) {}

  /**
   * POST /jpm/payments
   *
   * Pipeline:
   *   1. Serialise the payment DTO to JSON
   *   2. Sign the serialised body → x-jpm-signature header
   *   3. Encrypt the body with JPM's public key (if configured)
   *   4. POST to JPM /payments endpoint
   */
  @Post('payments')
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @Headers('x-request-id') requestId = 'unknown',
  ): Promise<unknown> {
    const serialised = JSON.stringify(dto);

    // ① Sign
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${process.env.JPMORGAN_ACCESS_TOKEN ?? ''}`,
    };

    if (this.signingService.isConfigured()) {
      headers['x-jpm-signature'] = this.signingService.sign(serialised);
      this.logger.debug('x-jpm-signature attached');
    }

    // ② Encrypt (optional — only when JPM public key is present)
    let body: string = serialised;
    if (this.encryptionService.isConfigured()) {
      body = this.encryptionService.encrypt(dto);
      headers['Content-Type'] = 'application/octet-stream';
      headers['x-jpm-encrypted'] = 'true';
      this.logger.debug('Request body encrypted');
    }

    // ③ Send — timed + counted
    const endTimer = this.metrics.startJpmApiTimer('createPayment');
    let response: unknown;
    try {
      const res = await this.jpmHttp.getClient().post('/payments', body, { headers });
      this.metrics.incrementJpmApiCalls('createPayment', 'success');
      response = res.data;
    } catch (err) {
      this.metrics.incrementJpmApiCalls('createPayment', 'failure');
      // ── SOC 2 audit — failure ──────────────────────────────────────────────
      this.audit.logFailure(
        {
          requestId,
          actor:      'system',
          action:     'jpm.payment.create',
          resourceId: dto.reference ?? 'unknown',
          extras: {
            amount:   dto.amount,
            currency: dto.currency,
          },
        },
        'JPM_PAYMENT_CREATE_FAILED',
        (err as Error)?.message ?? String(err),
      );
      throw err;
    } finally {
      endTimer();
    }

    // ── SOC 2 audit — success ──────────────────────────────────────────────
    this.audit.log({
      requestId,
      actor:      'system',
      action:     'jpm.payment.create',
      resourceId: dto.reference ?? 'unknown',
      result:     'success',
      extras: {
        amount:   dto.amount,
        currency: dto.currency,
      },
    });

    return response;
  }

  /**
   * POST /jpm/callbacks/payment
   *
   * Verifies the JPM webhook signature before processing.
   * Requires raw body middleware (see file header).
   */
  @Post('callbacks/payment')
  @HttpCode(HttpStatus.OK)
  async handlePaymentCallback(
    @Req() req: { rawBody?: Buffer },
    @Headers('x-jpm-signature') signature: string,
    @Headers('x-request-id') requestId = 'unknown',
    @Body() payload: JpmCallbackPayload,
  ): Promise<{ received: boolean }> {
    // ① Verify signature
    if (this.callbackVerificationService.isConfigured()) {
      const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(payload));
      const valid = this.callbackVerificationService.verify(rawBody, signature ?? '');
      if (!valid) {
        this.logger.warn('JPM callback rejected: invalid signature');
        this.metrics.incrementJpmCallbackVerification('invalid');
        // ── SOC 2 audit — invalid callback ──────────────────────────────────
        this.audit.logFailure(
          {
            requestId,
            actor:      'jpm-webhook',
            action:     'jpm.callback.verify',
            resourceId: payload.paymentId ?? 'unknown',
            extras:     { event_type: payload.eventType },
          },
          'JPM_CALLBACK_INVALID_SIGNATURE',
          'Inbound JPM webhook signature verification failed.',
        );
        throw new UnauthorizedException('Invalid JPM callback signature');
      }
      this.metrics.incrementJpmCallbackVerification('valid');
      this.logger.debug('JPM callback signature verified');
    } else {
      this.logger.warn('Callback verification not configured — skipping signature check');
    }

    // ② Process event
    this.logger.log(`JPM callback received: ${payload.eventType} / ${payload.paymentId}`);

    // ── SOC 2 audit — callback received ───────────────────────────────────
    this.audit.log({
      requestId,
      actor:      'jpm-webhook',
      action:     'jpm.callback.verify',
      resourceId: payload.paymentId ?? 'unknown',
      result:     'success',
      extras: {
        event_type: payload.eventType,
        status:     payload.status,
      },
    });

    // TODO: dispatch to your domain service based on payload.eventType

    return { received: true };
  }
}
