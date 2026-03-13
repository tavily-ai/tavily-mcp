/**
 * AgentQL MCP Server Integration
 *
 * This module provides integration with AgentQL's MCP server.
 * AgentQL is an AI-powered web querying tool that lets you extract structured
 * data from any web page using a GraphQL-like query language.
 *
 * AgentQL MCP Server: https://github.com/tinyfish-io/agentql-mcp
 * npm package: agentql-mcp
 *
 * Usage:
 * Add this server to your MCP client (e.g., Claude Desktop, Cursor) using
 * the npx command with your AGENTQL_API_KEY environment variable.
 */

import axios from 'axios';

// AgentQL MCP Server configuration
export const AGENTQL_MCP_SERVER = {
  name: 'agentql-mcp-server',
  npmPackage: 'agentql-mcp',
  command: 'npx',
  args: ['-y', 'agentql-mcp'],
  url: 'https://github.com/tinyfish-io/agentql-mcp',
  apiBaseUrl: 'https://api.agentql.com/v1',
  env: {
    AGENTQL_API_KEY: 'your-agentql-api-key'
  }
} as const;

/**
 * Parameters for AgentQL query requests
 */
export interface AgentQLQueryParams {
  /** Number of seconds to wait for the page to load before querying */
  wait_for?: number;
  /** Whether to scroll to the bottom of the page before querying */
  is_scroll_to_bottom_enabled?: boolean;
  /** Query mode: 'standard' (default) or 'fast' */
  mode?: 'standard' | 'fast';
  /** Whether to take a screenshot of the page */
  is_screenshot_mode?: boolean;
}

/**
 * Response from AgentQL query_data endpoint
 */
export interface AgentQLQueryResponse {
  data: Record<string, any>;
  metadata?: {
    request_id?: string;
    [key: string]: any;
  };
}

/**
 * Response from AgentQL get_web_element endpoint
 */
export interface AgentQLWebElementResponse {
  data: Record<string, any>;
  metadata?: {
    request_id?: string;
    [key: string]: any;
  };
}

/**
 * Check if AgentQL MCP server is configured
 */
export function isAgentQLConfigured(): boolean {
  return !!process.env.AGENTQL_API_KEY;
}

/**
 * Get AgentQL MCP server configuration
 */
export function getAgentQLConfig() {
  return {
    ...AGENTQL_MCP_SERVER,
    configured: isAgentQLConfigured()
  };
}

/**
 * List available AgentQL MCP tools
 */
export function listAgentQLServers(): Array<{ name: string; description: string }> {
  return [
    {
      name: 'query_data',
      description: 'AgentQL Query Data - Extract structured data from any web page using a GraphQL-like query language'
    },
    {
      name: 'get_web_element',
      description: 'AgentQL Get Web Element - Locate and retrieve specific web elements from a page using natural language queries'
    }
  ];
}

/**
 * Query structured data from a web page using AgentQL's query language.
 *
 * The query uses a GraphQL-like syntax to specify what data to extract.
 * Example query:
 *   {
 *     products[] {
 *       name
 *       price
 *       rating
 *     }
 *   }
 *
 * @param url - The URL of the web page to query
 * @param query - The AgentQL query string
 * @param params - Optional query parameters
 */
export async function queryData(
  url: string,
  query: string,
  params?: AgentQLQueryParams
): Promise<AgentQLQueryResponse> {
  const apiKey = process.env.AGENTQL_API_KEY;
  if (!apiKey) {
    throw new Error('AGENTQL_API_KEY environment variable is not set');
  }

  const response = await axios.post(
    `${AGENTQL_MCP_SERVER.apiBaseUrl}/query-data`,
    {
      url,
      query,
      params: {
        wait_for: params?.wait_for ?? 0,
        is_scroll_to_bottom_enabled: params?.is_scroll_to_bottom_enabled ?? false,
        mode: params?.mode ?? 'standard',
        is_screenshot_mode: params?.is_screenshot_mode ?? false
      }
    },
    {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

/**
 * Get web elements from a page using AgentQL's query language.
 *
 * Similar to query_data but returns web element references that can be
 * used for interaction (clicking, filling forms, etc.).
 *
 * @param url - The URL of the web page to query
 * @param query - The AgentQL query string describing the elements to find
 * @param params - Optional query parameters
 */
export async function getWebElement(
  url: string,
  query: string,
  params?: AgentQLQueryParams
): Promise<AgentQLWebElementResponse> {
  const apiKey = process.env.AGENTQL_API_KEY;
  if (!apiKey) {
    throw new Error('AGENTQL_API_KEY environment variable is not set');
  }

  const response = await axios.post(
    `${AGENTQL_MCP_SERVER.apiBaseUrl}/get-web-element`,
    {
      url,
      query,
      params: {
        wait_for: params?.wait_for ?? 0,
        is_scroll_to_bottom_enabled: params?.is_scroll_to_bottom_enabled ?? false,
        mode: params?.mode ?? 'standard',
        is_screenshot_mode: params?.is_screenshot_mode ?? false
      }
    },
    {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

/**
 * Get AgentQL MCP server information
 */
export async function getAgentQLServerInfo(): Promise<{
  name: string;
  version: string;
  configured: boolean;
  tools: Array<{ name: string; description: string }>;
}> {
  return {
    name: AGENTQL_MCP_SERVER.name,
    version: '1.0.0',
    configured: isAgentQLConfigured(),
    tools: listAgentQLServers()
  };
}

export default {
  AGENTQL_MCP_SERVER,
  isAgentQLConfigured,
  getAgentQLConfig,
  listAgentQLServers,
  queryData,
  getWebElement,
  getAgentQLServerInfo
};
