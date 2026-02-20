/**
 * Netlify MCP Server Integration
 *
 * This module provides integration with Netlify's official MCP server.
 * Netlify MCP Server enables AI agents to create, manage, and deploy
 * Netlify projects using natural language prompts.
 *
 * Netlify MCP Server: https://github.com/netlify/netlify-mcp
 * npm package: @netlify/mcp
 * Docs: https://docs.netlify.com/welcome/build-with-ai/netlify-mcp-server/
 *
 * Authentication: Uses Netlify OAuth by default (interactive login).
 * Optionally set NETLIFY_PERSONAL_ACCESS_TOKEN for non-interactive use.
 */

// Netlify MCP Server configuration
export const NETLIFY_MCP_SERVER = {
  name: 'netlify-mcp-server',
  npmPackage: '@netlify/mcp',
  command: 'npx',
  args: ['-y', '@netlify/mcp'],
  url: 'https://github.com/netlify/netlify-mcp',
  docsUrl: 'https://docs.netlify.com/welcome/build-with-ai/netlify-mcp-server/',
  env: {
    NETLIFY_PERSONAL_ACCESS_TOKEN: 'your-netlify-pat' // optional
  }
} as const;

/**
 * Check if Netlify MCP server is configured with a PAT
 * (OAuth is used by default; PAT is optional for non-interactive use)
 */
export function isNetlifyConfigured(): boolean {
  return !!process.env.NETLIFY_PERSONAL_ACCESS_TOKEN;
}

/**
 * Get Netlify MCP server configuration
 */
export function getNetlifyConfig() {
  return {
    ...NETLIFY_MCP_SERVER,
    configured: isNetlifyConfigured()
  };
}

/**
 * List all available Netlify MCP tools grouped by domain
 */
export function listNetlifyTools(): Array<{ name: string; description: string; domain: string }> {
  return [
    // Project tools
    {
      name: 'get-project',
      domain: 'project',
      description: 'Get a Netlify project/site by ID or name'
    },
    {
      name: 'get-projects',
      domain: 'project',
      description: 'List all Netlify projects/sites for the current team'
    },
    {
      name: 'create-new-project',
      domain: 'project',
      description: 'Create a new Netlify project/site'
    },
    {
      name: 'update-project-name',
      domain: 'project',
      description: 'Update the name of an existing Netlify project'
    },
    {
      name: 'update-visitor-access-controls',
      domain: 'project',
      description: 'Modify visitor access controls (password protection, JWT, etc.) for a project'
    },
    {
      name: 'update-project-forms',
      domain: 'project',
      description: 'Enable or disable Netlify form submissions for a project'
    },
    {
      name: 'get-forms-for-project',
      domain: 'project',
      description: 'Get all forms associated with a Netlify project'
    },
    {
      name: 'manage-form-submissions',
      domain: 'project',
      description: 'Manage form submissions for a Netlify project (list, delete, etc.)'
    },
    {
      name: 'manage-project-env-vars',
      domain: 'project',
      description: 'Create, update, or delete environment variables and secrets for a project'
    },
    // Deploy tools
    {
      name: 'get-deploy',
      domain: 'deploy',
      description: 'Get a specific Netlify deploy by deploy ID'
    },
    {
      name: 'get-deploy-for-site',
      domain: 'deploy',
      description: 'Get all deploys for a specific Netlify site'
    },
    {
      name: 'deploy-site',
      domain: 'deploy',
      description: 'Build and deploy a site to Netlify'
    },
    {
      name: 'deploy-site-remotely',
      domain: 'deploy',
      description: 'Deploy a site to Netlify using remote build infrastructure'
    },
    // User tools
    {
      name: 'get-user',
      domain: 'user',
      description: 'Get current authenticated Netlify user information'
    },
    // Team tools
    {
      name: 'get-team',
      domain: 'team',
      description: 'Get Netlify team information and settings'
    },
    // Extension tools
    {
      name: 'manage-extensions',
      domain: 'extension',
      description: 'Install or uninstall Netlify extensions for a project'
    }
  ];
}

/**
 * Get Netlify MCP server information
 */
export function getNetlifyServerInfo(): {
  name: string;
  version: string;
  configured: boolean;
  tools: Array<{ name: string; description: string; domain: string }>;
} {
  return {
    name: NETLIFY_MCP_SERVER.name,
    version: '1.15.1',
    configured: isNetlifyConfigured(),
    tools: listNetlifyTools()
  };
}

export default {
  NETLIFY_MCP_SERVER,
  isNetlifyConfigured,
  getNetlifyConfig,
  listNetlifyTools,
  getNetlifyServerInfo
};
