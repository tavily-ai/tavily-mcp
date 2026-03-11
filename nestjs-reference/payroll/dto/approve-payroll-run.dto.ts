// @ts-nocheck
/**
 * ApprovePayrollRunDto — NestJS DTO for POST /payroll/runs/:id/approve
 *
 * Mirrors the plain-TS ApprovePayrollRunServiceDto in src/payroll/payroll.service.ts
 * but adds class-validator decorators so NestJS ValidationPipe can validate
 * the incoming request body.
 *
 * Required npm packages (add to your NestJS project):
 *   npm install class-validator class-transformer
 */

import { IsString, IsNotEmpty } from 'class-validator';

/**
 * DTO for approving a payroll run (checker step in maker-checker workflow).
 *
 * The checker user ID must differ from the maker's createdBy — this constraint
 * is enforced in PayrollService.approveRun(), not at the DTO level.
 *
 * Usage with ValidationPipe (whitelist: true, transform: true):
 *   @Post('runs/:id/approve')
 *   approveRun(@Param('id') id: string, @Body() dto: ApprovePayrollRunDto) { ... }
 */
export class ApprovePayrollRunDto {
  /** Checker user ID who is approving the run (must differ from createdBy) */
  @IsString()
  @IsNotEmpty({ message: 'approvedBy is required (checker user ID)' })
  approvedBy: string;
}
