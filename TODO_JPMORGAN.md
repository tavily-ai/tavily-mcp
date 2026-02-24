# J.P. Morgan Account Balances API Integration - TODO

## Tasks

- [x] 1. Create src/jpmorgan.ts - J.P. Morgan Account Balances MCP integration ✅
- [x] 2. Update src/index.ts - Add J.P. Morgan tools, handlers, and format functions ✅
- [x] 3. Update README.md - Add J.P. Morgan Account Balances API section ✅
- [x] 4. Run npm run build - TypeScript compilation successful ✅
- [x] 5. Run critical-path tests - 36/36 passing ✅

## Details

### J.P. Morgan Account Balances API (v1.0.5)
- Endpoint: POST /balance
- Auth: OAuth Bearer token (JPMORGAN_ACCESS_TOKEN) or MTLS
- Environments:
  - Production OAuth: https://openbanking.jpmorgan.com/accessapi
  - Production MTLS: https://apigateway.jpmorgan.com/accessapi
  - Client Testing OAuth: https://openbankinguat.jpmorgan.com/accessapi
  - Client Testing MTLS: https://apigatewayqaf.jpmorgan.com/accessapi

### Tools (3 total)
1. `jpmorgan_retrieve_balances` - Retrieve real-time or historical account balances
2. `jpmorgan_list_tools` - List available J.P. Morgan MCP tools
3. `jpmorgan_get_server_info` - Get connection info and setup instructions
