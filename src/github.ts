/**
 * GitHub MCP Server Integration
 * 
 * This module provides integration with GitHub's MCP server.
 * This is a remote MCP server that can be added to your MCP client configuration.
 * 
 * GitHub MCP Server: https://github.com/github/github-mcp-server.git
 * 
 * Usage:
 * Add this server to your MCP client (e.g., Claude Desktop, Cursor) using
 * the remote MCP server URL with appropriate authentication.
 */

// GitHub MCP Server configuration
export const GITHUB_MCP_SERVER = {
  name: 'github-mcp-server',
  npmPackage: '@github/mcp-server',
  command: 'npx',
  args: ['-y', '@github/mcp-server'],
  url: 'https://github.com/github/github-mcp-server.git',
  env: {
    GITHUB_TOKEN: 'your-github-token'
  }
} as const;

/**
 * Check if GitHub MCP server is configured
 */
export function isGitHubConfigured(): boolean {
  return !!process.env.GITHUB_TOKEN;
}

/**
 * Get GitHub MCP server configuration
 */
export function getGitHubConfig() {
  return {
    ...GITHUB_MCP_SERVER,
    configured: isGitHubConfigured()
  };
}

/**
 * List available GitHub MCP servers/tools
 */
export function listGitHubServers(): Array<{ name: string; description: string }> {
  return [
    {
      name: 'github-code-scanning',
      description: 'GitHub Code Scanning - Security vulnerability detection'
    },
    {
      name: 'github-issues',
      description: 'GitHub Issues - Create, read, update, and search issues'
    },
    {
      name: 'github-pull-requests',
      description: 'GitHub Pull Requests - Create, read, update, and search PRs'
    },
    {
      name: 'github-repositories',
      description: 'GitHub Repositories - Manage repositories, branches, and commits'
    },
    {
      name: 'github-search',
      description: 'GitHub Search - Search code, issues, PRs, and repositories'
    },
    {
      name: 'github-actions',
      description: 'GitHub Actions - Manage workflows and runs'
    }
  ];
}

/**
 * Get GitHub MCP server information
 */
export async function getGitHubServerInfo(): Promise<{
  name: string;
  version: string;
  configured: boolean;
  tools: Array<{ name: string; description: string }>;
}> {
  return {
    name: GITHUB_MCP_SERVER.name,
    version: '1.0.0',
    configured: isGitHubConfigured(),
    tools: listGitHubServers()
  };
}

export default {
  GITHUB_MCP_SERVER,
  isGitHubConfigured,
  getGitHubConfig,
  listGitHubServers,
  getGitHubServerInfo
};
