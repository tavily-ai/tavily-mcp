# Alby MCP Integration - TODO

## Tasks

- [x] 1. Create src/alby.ts - Alby MCP server config, listAlbyServers, isAlbyConfigured, getAlbyConfig
- [x] 2. Update src/index.ts - Add alby imports, tool definitions, handlers, format functions
- [x] 3. Update README.md - Add Alby MCP Server section
- [x] 4. Run npm run build - TypeScript compilation successful ✅
- [x] 5. Critical-path tests - 36/36 passed ✅

## All tasks completed

## Details

### Alby MCP Server (<https://github.com/getAlby/mcp>)

- npm package: `@getalby/mcp`
- Auth env var: `NWC_CONNECTION_STRING` (Nostr Wallet Connect connection string)
- Remote server (HTTP Streamable): `https://mcp.getalby.com/mcp`
- Remote server (SSE): `https://mcp.getalby.com/sse`

### Tools (11 total)

NWC tools:

1. `get_balance` - Get the balance of the connected lightning wallet
2. `get_info` - Get NWC capabilities and general information about the wallet and underlying lightning node
3. `get_wallet_service_info` - Get NWC capabilities, supported encryption and notification types
4. `lookup_invoice` - Look up lightning invoice details from a BOLT-11 invoice or payment hash
5. `make_invoice` - Create a lightning invoice
6. `pay_invoice` - Pay a lightning invoice
7. `list_transactions` - List all transactions from the connected wallet with optional filtering

Lightning tools:
8. `fetch_l402` - Fetch a paid resource protected by L402
9. `fiat_to_sats` - Convert fiat amounts to sats
10. `parse_invoice` - Parse a BOLT-11 lightning invoice
11. `request_invoice` - Request an invoice from a lightning address
