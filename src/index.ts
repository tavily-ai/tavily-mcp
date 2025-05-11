#!/usr/bin/env node

import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.TAVILY_API_KEY;
if (!API_KEY) {
  throw new Error("TAVILY_API_KEY environment variable is required");
}

// Create a new server instance for each request
function getServer(): McpServer {
  const server = new McpServer({
    name: "tavily-mcp",
    version: "0.1.4",
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    }
  });

  // Register tool handlers
  server.tool(
    "tavily-search", 
    { query: { 
      type: "string", 
      description: "Search query" 
    }
  }, async ({ query }) => {
    
    // If no query is provided, use a default query to support MCP Inspector testing
    if (!query) {
      query = "What is tavily?";
    }
    try {
      const response = await axios.post('https://api.tavily.com/search', {
        api_key: API_KEY,
        query
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(response.data, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  });

  return server;
}

const app = express();
app.use(express.json());

app.post('/mcp', async (req: Request, res: Response) => {
  try {
    const server = getServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      console.log('Request closed');
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

app.get('/mcp', async (req: Request, res: Response) => {
  console.log('Received GET MCP request');
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  });
});

app.delete('/mcp', async (req: Request, res: Response) => {
  console.log('Received DELETE MCP request');
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP Stateless Streamable HTTP Server listening on port ${PORT}`);
});
