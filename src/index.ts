#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { TavilyMcpServer } from "./mcp/server.js";
import { TavilyClientCore } from "./core/tavily-client.js";

dotenv.config();

// Get API key from environment
const API_KEY = process.env.TAVILY_API_KEY;
if (!API_KEY) {
  console.error("Error: TAVILY_API_KEY environment variable is required");
  console.error("Please set your Tavily API key:");
  console.error("export TAVILY_API_KEY=your_api_key_here");
  process.exit(1);
}

function listTools(): void {
  const tavilyClient = new TavilyClientCore();
  const tools = tavilyClient.getTools();

  console.log("Available Tavily MCP Tools:");
  console.log("============================");
  tools.forEach(tool => {
    console.log(`\n📋 ${tool.name}`);
    console.log(`   ${tool.description}`);
    console.log(`   Required: ${tool.inputSchema.required ? tool.inputSchema.required.join(', ') : 'None'}`);
  });
  console.log(`\nUsage: npx tavily-mcp`);
  console.log(`Environment: Set TAVILY_API_KEY environment variable`);
  process.exit(0);
}

async function startServer(): Promise<void> {
  if (!API_KEY) {
    throw new Error("API_KEY is required but not set");
  }
  
  const mcpServer = new TavilyMcpServer({ apiKey: API_KEY });
  const server = mcpServer.getServer();
  
  // Setup graceful shutdown
  process.on('SIGINT', async () => {
    console.error("Shutting down Tavily MCP server...");
    await server.close();
    process.exit(0);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Tavily MCP server running on stdio");
}

// Add command line argument parsing
interface Arguments {
  'list-tools': boolean;
  _: (string | number)[];
  $0: string;
}

const argv = yargs(hideBin(process.argv))
  .option('list-tools', {
    type: 'boolean',
    description: 'List all available tools and exit',
    default: false
  })
  .help()
  .parse() as Arguments;

// List tools if requested
if (argv['list-tools']) {
  listTools();
} else {
  // Otherwise start the MCP server
  startServer().catch((error) => {
    console.error("Failed to start Tavily MCP server:", error);
    process.exit(1);
  });
}
