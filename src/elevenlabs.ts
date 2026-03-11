/**
 * Eleven Labs MCP Integration
 * 
 * This module provides integration with Eleven Labs' MCP server.
 * Eleven Labs is a text-to-speech API that offers high-quality voice synthesis.
 * 
 * MCP Server:
 * - Can be run locally using npx @elevenlabs/mcp-server
 * 
 * Usage:
 * Add this server to your MCP client (e.g., Claude Desktop, Cursor) using
 * the npx command or configure with your API key.
 */

import axios from 'axios';

// Eleven Labs MCP Server configuration
// Note: Eleven Labs MCP server is typically run locally via npx
export const ELEVENTLABS_MCP_SERVER = {
  name: 'elevenlabs',
  // Local MCP server command
  npmPackage: '@elevenlabs/mcp-server',
  npmCommand: 'npx -y @elevenlabs/mcp-server',
  // Environment variable for API key
  apiKeyEnvVar: 'ELEVENLABS_API_KEY',
  // Documentation
  docsUrl: 'https://elevenlabs.io/docs',
  githubUrl: 'https://github.com/elevenlabs/elevenlabs-mcp'
} as const;

export type ElevenLabsService = typeof ELEVENTLABS_MCP_SERVER;

/**
 * Check if Eleven Labs API key is configured
 */
export function isElevenLabsConfigured(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}

/**
 * Get Eleven Labs MCP server configuration
 */
export function getElevenLabsConfig(): typeof ELEVENTLABS_MCP_SERVER {
  return ELEVENTLABS_MCP_SERVER;
}

/**
 * List available Eleven Labs MCP servers/tools
 */
export function listElevenLabsServers(): Array<{ name: string; description: string }> {
  return [
    {
      name: 'elevenlabs-text-to-speech',
      description: 'Convert text to speech using Eleven Labs high-quality voice synthesis'
    },
    {
      name: 'elevenlabs-voices',
      description: 'List available voices in your Eleven Labs account'
    },
    {
      name: 'elevenlabs-models',
      description: 'List available TTS models'
    },
    {
      name: 'elevenlabs-settings',
      description: 'Get or set user preferences and default settings'
    }
  ];
}

/**
 * Interface for MCP server info
 */
export interface MCPServerInfo {
  name: string;
  version: string;
  capabilities: {
    tools?: Record<string, any>;
  };
}

/**
 * Get Eleven Labs MCP server info
 * This is a placeholder - in practice, you would use an MCP client to connect
 */
export async function getElevenLabsServerInfo(): Promise<MCPServerInfo | null> {
  console.log(`Eleven Labs MCP server: ${ELEVENTLABS_MCP_SERVER.npmCommand}`);
  console.log('Note: Eleven Labs MCP server should be configured in your MCP client');
  console.log(`Required environment variable: ${ELEVENTLABS_MCP_SERVER.apiKeyEnvVar}`);
  
  return {
    name: 'elevenlabs-mcp',
    version: '1.0.0',
    capabilities: {
      tools: {
        'elevenlabs-text-to-speech': {
          name: 'elevenlabs-text-to-speech',
          description: 'Convert text to speech using Eleven Labs'
        }
      }
    }
  };
}

export default {
  ELEVENTLABS_MCP_SERVER,
  isElevenLabsConfigured,
  getElevenLabsConfig,
  listElevenLabsServers,
  getElevenLabsServerInfo
};
