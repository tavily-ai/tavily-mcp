# J.P. Morgan Payments API Integration - TODO

## Tasks

- [x] 1. Create src/jpmorgan_payments.ts - ACH/Wire Payments API integration ✅
- [x] 2. Update src/index.ts - Add imports, tool definitions, handlers, format functions ✅
- [x] 3. Update test_critical_path.mjs - Add payments module tests ✅
- [x] 4. Run npm run build - TypeScript compilation ✅
- [x] 5. Run node test_critical_path.mjs - 91/91 tests passing ✅

## Details

### J.P. Morgan Payments API
- Docs: https://developer.jpmorgan.com
- Production: https://apigateway.jpmorgan.com/payments/v1
- Testing:    https://apigatewayqaf.jpmorgan.com/payments/v1
- Auth: JPMORGAN_ACCESS_TOKEN (shared with Account Balances + Embedded Payments)
- Default env: testing

### Supported Payment Types
- ACH  — Automated Clearing House (domestic US)
- WIRE — Domestic/international wire transfer
- RTP  — Real-Time Payments
- BOOK — Internal book transfer

### Sample ACH Payload
```json
{
  "paymentType": "ACH",
  "companyId": "YOUR_ACH_COMPANY_ID",
  "debitAccount": "YOUR_OWLBAN_OPERATING_ACCOUNT",
  "creditAccount": {
    "routingNumber": "XXXXX",
    "accountNumber": "YYYYY",
    "accountType": "CHECKING"
  },
  "amount": {
    "currency": "USD",
    "value": "1500.00"
  },
  "memo": "Payroll - Employee 104",
  "effectiveDate": "2026-03-04"
}
```

### MCP Tools (5 total)
1. `jpmorgan_create_payment`       - POST /payments — Initiate ACH/Wire/RTP/Book payment
2. `jpmorgan_get_payment`          - GET  /payments/{paymentId} — Get payment status
3. `jpmorgan_list_payments`        - GET  /payments — List payments with optional filters
4. `jpmorgan_payments_list_tools`  - Meta: list available payments tools
5. `jpmorgan_payments_get_server_info` - Meta: connection info and setup instructions
