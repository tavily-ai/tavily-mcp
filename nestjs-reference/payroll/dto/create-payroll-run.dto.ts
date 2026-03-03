// @ts-nocheck
/**
 * CreatePayrollRunDto — NestJS DTO for POST /payroll/runs
 *
 * Mirrors the plain-TS CreatePayrollRunServiceDto in src/payroll/payroll.service.ts
 * but adds class-validator / class-transformer decorators so NestJS
 * ValidationPipe can validate and transform the incoming request body.
 *
 * Required npm packages (add to your NestJS project):
 *   npm install class-validator class-transformer
 */

import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsNumber,
  IsPositive,
  IsIn,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── PayrollItemDto ───────────────────────────────────────────────────────────

/**
 * A single payroll disbursement item.
 * Mirrors the inline item shape in CreatePayrollRunServiceDto.
 */
export class PayrollItemDto {
  /** Unique employee identifier (e.g. 'EMP-001') */
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  /** Full name of the employee */
  @IsString()
  @IsNotEmpty()
  employeeName: string;

  /** ABA routing number — exactly 9 digits */
  @IsString()
  @Matches(/^\d{9}$/, { message: 'routingNumber must be exactly 9 digits' })
  routingNumber: string;

  /** Employee bank account number */
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  /** Bank account type */
  @IsIn(['CHECKING', 'SAVINGS'], {
    message: "accountType must be 'CHECKING' or 'SAVINGS'",
  })
  accountType: 'CHECKING' | 'SAVINGS';

  /** Gross pay amount in USD — must be > 0 */
  @IsNumber()
  @IsPositive()
  amount: number;

  /** Requested ACH settlement date in yyyy-MM-dd format */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effectiveDate must be in yyyy-MM-dd format (e.g. 2026-03-14)',
  })
  effectiveDate: string;
}

// ─── CreatePayrollRunDto ──────────────────────────────────────────────────────

/**
 * DTO for creating a new payroll run (maker step in maker-checker workflow).
 *
 * Usage with ValidationPipe (whitelist: true, transform: true):
 *   @Post('runs')
 *   createRun(@Body() dto: CreatePayrollRunDto) { ... }
 */
export class CreatePayrollRunDto {
  /** Maker user ID who is initiating the run */
  @IsString()
  @IsNotEmpty({ message: 'createdBy is required (maker user ID)' })
  createdBy: string;

  /** Array of payroll items to disburse — minimum 1 */
  @IsArray()
  @ArrayMinSize(1, { message: 'items must contain at least one payroll item' })
  @ValidateNested({ each: true })
  @Type(() => PayrollItemDto)
  items: PayrollItemDto[];
}
