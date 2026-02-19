/**
 * Alby Bitcoin Lightning MCP Server Integration
 *
 * This module provides integration with Alby's MCP server for Bitcoin Lightning
 * wallet operations using Nostr Wallet Connect (NWC).
 *
 * Alby MCP Server: https://github.com/getAlby/mcp
 * npm package: @getalby/mcp
 *
 * Supports both local (STDIO) and remote (HTTP Streamable / SSE) modes.
 * Authentication uses a Nostr Wallet Connect (NWC) connection string.
 */

// Alby MCP Server configuration
export const ALBY_MCP_SERVER = {
  name: 'alby-mcp-server',
  npmPackage: '@getalby/mcp',
  command: 'npx',
  args: ['-y', '@getalby/mcp'],
  url: 'https://github.com/getAlby/mcp',
  remoteUrls: {
    httpStreamable: 'https://mcp.getalby.com/mcp',
    sse: 'https://mcp.getalby.com/sse'
  },
  env: {
    NWC_CONNECTION_STRING: 'nostr+walletconnect://...'
  }
} as const;

/**
 * Check if Alby MCP server is configured
 */
export function isAlbyConfigured(): boolean {
  return !!process.env.NWC_CONNECTION_STRING;
}

/**
 * Get Alby MCP server configuration
 */
export function getAlbyConfig() {
  return {
    ...ALBY_MCP_SERVER,
    configured: isAlbyConfigured()
  };
}

/**
 * List all available Alby MCP tools
 */
export function listAlbyServers(): Array<{ name: string; description: string }> {
  return [
    // NWC tools
    {
      name: 'get_balance',
      description: 'Get the balance of the connected lightning wallet'
    },
    {
      name: 'get_info',
      description: 'Get NWC capabilities and general information about the wallet and underlying lightning node'
    },
    {
      name: 'get_wallet_service_info',
      description: 'Get NWC capabilities, supported encryption and notification types of the connected lightning wallet'
    },
    {
      name: 'lookup_invoice',
      description: 'Look up lightning invoice details from a BOLT-11 invoice or payment hash'
    },
    {
      name: 'make_invoice',
      description: 'Create a lightning invoice'
    },
    {
      name: 'pay_invoice',
      description: 'Pay a lightning invoice'
    },
    {
      name: 'list_transactions',
      description: 'List all transactions from the connected wallet with optional filtering by time, type, and limit'
    },
    // Lightning tools
    {
      name: 'fetch_l402',
      description: 'Fetch a paid resource protected by L402 (Lightning HTTP 402 Payment Required)'
    },
    {
      name: 'fiat_to_sats',
      description: 'Convert fiat currency amounts (e.g. USD, EUR) to satoshis'
    },
    {
      name: 'parse_invoice',
      description: 'Parse a BOLT-11 lightning invoice and return its details'
    },
    {
      name: 'request_invoice',
      description: 'Request a lightning invoice from a lightning address (LNURL)'
    }
  ];
}

export default {
  ALBY_MCP_SERVER,
  isAlbyConfigured,
  getAlbyConfig,
  listAlbyServers
};
