# Payroll Domain Model Integration TODO

## Steps

- [ ] 1. Create `src/payroll/models/payroll-run.model.ts` — PayrollStatus, PayrollPayment, PayrollRun entity
- [ ] 2. Update `src/payroll.ts` — rename PayrollRun→CreatePayrollRunDto, import+re-export new types, add mappers
- [ ] 3. Update `src/index.ts` — use CreatePayrollRunDto instead of PayrollRun for handler DTO
- [ ] 4. Run `npm run build` — zero TypeScript errors
- [ ] 5. Run all test suites — 201/201 passing
- [ ] 6. Commit and push to owlban
