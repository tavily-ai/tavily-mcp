# JPMorgan Payment Flow Prompt

## Context
Implementing a new payment flow using J.P. Morgan Embedded Payments API or Corporate QuickPay.

## Input
- Payment type: <ach|wire|real-time|virtual-account>
- Use case: <payroll|vendor-payments|customer-refunds|other>
- Required features: <recurring|one-time|batch|single>

## Tasks

### 1. Define Payment DTOs
```typescript
// payroll/dto/create-<flow>-dto.ts
import { IsString, IsNumber, IsDateString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class <Flow>PaymentDto {
  @IsString()
  companyId: string;

  @IsString()
  debitAccount: string;

  @ValidateNested()
  @Type(() => CreditAccountDto)
  creditAccount: CreditAccountDto;

  @ValidateNested()
  @Type(() => AmountDto)
  amount: AmountDto;

  @IsString()
  @IsOptional()
  memo?: string;

  @IsDateString()
  effectiveDate: string;
}

export class CreditAccountDto {
  @IsString()
  routingNumber: string;

  @IsString()
  accountNumber: string;

  @IsString()
  accountType: 'CHECKING' | 'SAVINGS';
}

export class AmountDto {
  @IsString()
  currency: string;

  @IsString()
  value: string;
}
```

### 2. Implement Service Method
```typescript
// payroll/services/<flow>.service.ts
import { Injectable } from '@nestjs/common';
import { JpmcCorporateQuickPayClient } from '../../jpm/services/jpmc-corporate-quickpay.client';
import { AuditLoggerService } from '../../common/logger/audit-logger.service';
import { maskPaymentItem } from '../../common/utils/pii.util';
import { <Flow>PaymentDto } from '../dto/create-<flow>-dto';

@Injectable()
export class <Flow>Service {
  constructor(
    private readonly quickPay: JpmcCorporateQuickPayClient,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async createPayment(dto: <Flow>PaymentDto, userId: string) {
    // Create payment via JPMC
    const payment = await this.quickPay.createAchPayment({
      paymentType: 'ACH',
      companyId: dto.companyId,
      debitAccount: dto.debitAccount,
      creditAccount: dto.creditAccount,
      amount: dto.amount,
      memo: dto.memo,
      effectiveDate: dto.effectiveDate,
    });

    // Audit log with PII masking
    this.auditLogger.log({
      action: '<flow>.payment.create',
      actor: userId,
      resource_id: payment.paymentId,
      result: 'success',
      amount_usd: parseFloat(dto.amount.value),
      ...maskPaymentItem({
        routingNumber: dto.creditAccount.routingNumber,
        accountNumber: dto.creditAccount.accountNumber,
      }),
    });

    return payment;
  }

  async getPaymentStatus(paymentId: string) {
    const status = await this.quickPay.getPaymentStatus(paymentId);
    
    // Handle returned payments
    if (status.status === 'RETURNED') {
      this.auditLogger.log({
        action: '<flow>.payment.returned',
        actor: 'system',
        resource_id: paymentId,
        result: 'failure',
        error_code: status.returnCode,
      });
    }

    return status;
  }
}
```

### 3. Add Controller Endpoints
```typescript
// payroll/controllers/<flow>.controller.ts
import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { <Flow>Service } from '../services/<flow>.service';
import { <Flow>PaymentDto } from '../dto/create-<flow>-dto';
import { AuthGuard } from '../../auth/auth.guard';

@Controller('<flow>')
@UseGuards(AuthGuard)
export class <Flow>Controller {
  constructor(private readonly service: <Flow>Service) {}

  @Post('payments')
  async createPayment(
    @Body() dto: <Flow>PaymentDto,
    @CurrentUser() user: User,
  ) {
    return this.service.createPayment(dto, user.id);
  }

  @Get('payments/:id/status')
  async getStatus(@Param('id') paymentId: string) {
    return this.service.getPaymentStatus(paymentId);
  }
}
```

### 4. Add Metrics
```typescript
// Add to metrics service
export class MetricsService {
  public readonly <flow>PaymentsTotal = new Counter({
    name: '<flow>_payments_total',
    help: 'Total <flow> payments',
    labelNames: ['status'],
  });

  public readonly <flow>PaymentAmount = new Histogram({
    name: '<flow>_payment_amount_usd',
    help: '<flow> payment amounts',
    buckets: [100, 500, 1000, 5000, 10000, 50000],
  });
}
```

### 5. Update Module
```typescript
// payroll/payroll.module.ts
import { Module } from '@nestjs/common';
import { <Flow>Service } from './services/<flow>.service';
import { <Flow>Controller } from './controllers/<flow>.controller';

@Module({
  providers: [<Flow>Service],
  controllers: [<Flow>Controller],
})
export class PayrollModule {}
```

### 6. Handle Callbacks (if needed)
```typescript
// jpm/controllers/jpm-payment.controller.ts
@Post('callbacks/<flow>')
async handle<Flow>Callback(
  @Body() payload: Buffer,
  @Headers('x-jpm-signature') signature: string,
) {
  // Verify signature
  const isValid = this.callbackVerification.verify(payload, signature);
  
  if (!isValid) {
    this.auditLogger.log({
      action: '<flow>.callback.verify',
      actor: 'jpm-webhook',
      result: 'failure',
      error_code: 'INVALID_SIGNATURE',
    });
    throw new UnauthorizedException('Invalid signature');
  }

  const event = JSON.parse(payload.toString());
  
  // Process callback
  await this.service.handleCallback(event);
  
  this.auditLogger.log({
    action: '<flow>.callback.processed',
    actor: 'jpm-webhook',
    resource_id: event.paymentId,
    result: 'success',
  });

  return { received: true };
}
```

### 7. Add Tests
```typescript
// nestjs-test/tests/<flow>.spec.ts
describe('<Flow>Service', () => {
  let service: <Flow>Service;
  let quickPay: jest.Mocked<JpmcCorporateQuickPayClient>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        <Flow>Service,
        {
          provide: JpmcCorporateQuickPayClient,
          useValue: {
            createAchPayment: jest.fn(),
            getPaymentStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(<Flow>Service);
    quickPay = module.get(JpmcCorporateQuickPayClient);
  });

  it('should create payment and log audit event', async () => {
    const dto = create<Flow>PaymentDtoMock();
    const userId = 'user-123';
    
    quickPay.createAchPayment.mockResolvedValue({
      paymentId: 'pay-123',
      status: 'PENDING',
    });

    const result = await service.createPayment(dto, userId);

    expect(result.paymentId).toBe('pay-123');
    expect(quickPay.createAchPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentType: 'ACH',
        companyId: dto.companyId,
      }),
    );
  });
});
```

## Security Checklist
- [ ] DTO validation with class-validator
- [ ] PII masking in audit logs
- [ ] Signature verification for callbacks
- [ ] Authorization checks (AuthGuard)
- [ ] Input sanitization
- [ ] Error handling without data exposure

## Compliance Checklist
- [ ] Audit logging for all operations
- [ ] Financial amounts tracked
- [ ] Maker/checker pattern (if required)
- [ ] Idempotency for duplicate prevention
- [ ] Reconciliation capabilities

## Testing Checklist
- [ ] Unit tests for service methods
- [ ] Integration test with JPMC sandbox
- [ ] Callback signature verification test
- [ ] Error handling test
- [ ] PII masking verification

