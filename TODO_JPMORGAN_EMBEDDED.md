# J.P. Morgan Embedded Payments API Integration - TODO

## Tasks

- [ ] 1. Create src/jpmorgan_embedded.ts - Embedded Payments API integration
- [ ] 2. Update src/index.ts - Add imports, tool definitions, handlers, format functions
- [ ] 3. Update README.md - Add Embedded Payments section
- [ ] 4. Run npm run build - TypeScript compilation
- [ ] 5. Add tests to test_critical_path.mjs - Config, tool list, error paths
- [ ] 6. Run node test_critical_path.mjs - Verify all tests pass
- [ ] 7. Commit and push changes

## Details

### J.P. Morgan Embedded Payments API
- Docs: https://developer.payments.jpmorgan.com
- Production: https://apigateway.jpmorgan.com/tsapi/v1/ef
- Mock/testing: https://api-mock.payments.jpmorgan.com/tsapi/v1/ef
- Auth: JPMORGAN_ACCESS_TOKEN (shared with Account Balances API)
- Default env: production (beta prototype)

### Tools (5 total)
1. `ef_list_clients` - GET /clients — List embedded finance clients
2. `ef_get_client` - GET /clients/{clientId} — Get a specific client
3. `ef_create_client` - POST /clients — Create a new embedded finance client
4. `ef_list_accounts` - GET /clients/{clientId}/accounts — List accounts (v2 beta)
5. `ef_get_account` - GET /clients/{clientId}/accounts/{accountId} — Get a specific account (v2 beta)

### MCP Tool Definitions (7 total including meta tools)
- ef_list_clients, ef_get_client, ef_create_client
- ef_list_accounts, ef_get_account
- ef_list_tools (meta)
- ef_get_server_info (meta)
