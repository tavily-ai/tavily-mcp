/**
 * Cloudflare Observability MCP Integration
 * 
 * This module provides integration with Cloudflare's Observability MCP server.
 * It offers tools for monitoring, logs, and metrics.
 * 
 * Server URL: https://observability.mcp.cloudflare.com/mcp
 */

import axios from 'axios';

// Cloudflare Observability MCP Server URL
export const OBSERVABILITY_SERVER_URL = 'https://observability.mcp.cloudflare.com/mcp';

/**
 * Check if Cloudflare API token is configured
 */
export function isCloudflareObservabilityConfigured(): boolean {
  return !!process.env.CLOUDFLARE_API_TOKEN;
}

/**
 * Get the Observability server URL
 */
export function getObservabilityServerUrl(): string {
  return OBSERVABILITY_SERVER_URL;
}

/**
 * Interface for Observability tool parameters
 */
export interface ObservabilityParams {
  apiToken?: string;
  [key: string]: any;
}

/**
 * Connect to Cloudflare Observability MCP server
 * This is a placeholder - in practice, you would use an MCP client to connect
 */
export async function connectToObservability(params: ObservabilityParams): Promise<any> {
  const apiToken = params.apiToken || process.env.CLOUDFLARE_API_TOKEN;
  
  if (!apiToken) {
    throw new Error('CLOUDFLARE_API_TOKEN environment variable is required');
  }

  console.log(`Connecting to Cloudflare Observability MCP server: ${OBSERVABILITY_SERVER_URL}`);
  console.log('Note: Cloudflare Observability should be configured in your MCP client');
  
  return {
    serverUrl: OBSERVABILITY_SERVER_URL,
    status: 'configured',
    message: 'Use your MCP client to connect to this remote server'
  };
}

/**
 * List available Observability tools
 */
export function listObservabilityTools(): Array<{ name: string; description: string }> {
  return [
    {
      name: 'cloudflare_observability_metrics',
      description: 'Get metrics from Cloudflare Observability'
    },
    {
      name: 'cloudflare_observability_logs',
      description: 'Query logs from Cloudflare Observability'
    },
    {
      name: 'cloudflare_observability_status',
      description: 'Get status information from Cloudflare Observability'
    }
  ];
}

export default {
  OBSERVABILITY_SERVER_URL,
  isCloudflareObservabilityConfigured,
  getObservabilityServerUrl,
  connectToObservability,
  listObservabilityTools
};
