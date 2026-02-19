#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {CallToolRequestSchema, ListToolsRequestSchema, Tool} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  isStripeConfigured,
  createPaymentIntent,
  getPaymentIntent,
  createCustomer,
  getCustomer,
  listCharges,
  createCheckoutSession,
  getCheckoutSession
} from './stripe.js';

// Cloudflare imports
import {
  CLOUDFLARE_MCP_SERVERS,
  listCloudflareServers
} from './cloudflare.js';

// Eleven Labs imports
import {
  listElevenLabsServers,
  isElevenLabsConfigured,
  getElevenLabsConfig
} from './elevenlabs.js';

// GitHub imports
import {
  listGitHubServers,
  isGitHubConfigured,
  getGitHubConfig
} from './github.js';

// AgentQL imports
import {
  listAgentQLServers,
  isAgentQLConfigured,
  getAgentQLConfig,
  queryData as agentqlQueryData,
  getWebElement as agentqlGetWebElement
} from './agentql.js';

// Alby imports
import {
  listAlbyServers,
  isAlbyConfigured,
  getAlbyConfig,
  ALBY_MCP_SERVER
} from './alby.js';



dotenv.config();

const API_KEY = process.env.TAVILY_API_KEY;


interface TavilyResponse {
  // Response structure from Tavily API
  query: string;
  follow_up_questions?: Array<string>;
  answer?: string;
  images?: Array<string | {
    url: string;
    description?: string;
  }>;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    published_date?: string;
    raw_content?: string;
    favicon?: string;
  }>;
}

interface TavilyCrawlResponse {
  base_url: string;
  results: Array<{
    url: string;
    raw_content: string;
    favicon?: string;
  }>;
  response_time: number;
}

interface TavilyResearchResponse {
  request_id?: string;
  status?: string;
  content?: string;
  error?: string;
}

interface TavilyMapResponse {
  base_url: string;
  results: string[];
  response_time: number;
}

class TavilyClient {
  // Core client properties
  private server: Server;
  private axiosInstance;
  private baseURLs = {
    search: 'https://api.tavily.com/search',
    extract: 'https://api.tavily.com/extract',
    crawl: 'https://api.tavily.com/crawl',
    map: 'https://api.tavily.com/map',
    research: 'https://api.tavily.com/research'
  };

  constructor() {
    this.server = new Server(
      {
        name: "tavily-mcp",
        version: "0.2.10",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'X-Client-Source': 'MCP'
      }
    });

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error: any) => {
      console.error("[MCP Error]", error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private getDefaultParameters(): Record<string, any> {
    /**Get default parameter values from environment variable.
     * 
     * The environment variable DEFAULT_PARAMETERS should contain a JSON string 
     * with parameter names and their default values.
     * Example: DEFAULT_PARAMETERS='{"search_depth":"basic","include_images":true}'
     * 
     * Returns:
     *   Object with default parameter values, or empty object if env var is not present or invalid.
     */
    try {
      const parametersEnv = process.env.DEFAULT_PARAMETERS;
      
      if (!parametersEnv) {
        return {};
      }
      
      // Parse the JSON string
      const defaults = JSON.parse(parametersEnv);
      
      if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) {
        console.warn(`DEFAULT_PARAMETERS is not a valid JSON object: ${parametersEnv}`);
        return {};
      }
      
      return defaults;
    } catch (error: any) {
      console.warn(`Failed to parse DEFAULT_PARAMETERS as JSON: ${error.message}`);
      return {};
    }
  }

  private setupHandlers(): void {
    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Define available tools: tavily_search and tavily_extract
      const tools: Tool[] = [
        {
          name: "tavily_search",
          description: "Search the web for current information on any topic. Use for news, facts, or data beyond your knowledge cutoff. Returns snippets and source URLs.",
          inputSchema: {
            type: "object",
            properties: {
              query: { 
                type: "string", 
                description: "Search query" 
              },
              search_depth: {
                type: "string",
                enum: ["basic","advanced","fast","ultra-fast"],
                description: "The depth of the search. 'basic' for generic results, 'advanced' for more thorough search, 'fast' for optimized low latency with high relevance, 'ultra-fast' for prioritizing latency above all else",
                default: "basic"
              },
              topic : {
                type: "string",
                enum: ["general"],
                description: "The category of the search. This will determine which of our agents will be used for the search",
                default: "general"
              },
              time_range: {
                type: "string",
                description: "The time range back from the current date to include in the search results",
                enum: ["day", "week", "month", "year"]
              },
              start_date: {
                type: "string",
                description: "Will return all results after the specified start date. Required to be written in the format YYYY-MM-DD.",
                default: "",
              },
              end_date: { 
                type: "string",
                description: "Will return all results before the specified end date. Required to be written in the format YYYY-MM-DD",
                default: "",
              },
              max_results: { 
                type: "number", 
                description: "The maximum number of search results to return",
                default: 5,
                minimum: 5,
                maximum: 20
              },
              include_images: { 
                type: "boolean", 
                description: "Include a list of query-related images in the response",
                default: false,
              },
              include_image_descriptions: { 
                type: "boolean", 
                description: "Include a list of query-related images and their descriptions in the response",
                default: false
              },
              include_raw_content: {
                type: "boolean",
                description: "Include the cleaned and parsed HTML content of each search result",
                default: false
              },
              include_domains: {
                type: "array",
                items: { type: "string" },
                description: "A list of domains to specifically include in the search results, if the user asks to search on specific sites set this to the domain of the site",
                default: []
              },
              exclude_domains: {
                type: "array",
                items: { type: "string" },
                description: "List of domains to specifically exclude, if the user asks to exclude a domain set this to the domain of the site",
                default: []
              },
              country: {
                type: "string",
                description: "Boost search results from a specific country. This will prioritize content from the selected country in the search results. Available only if topic is general.",
                default: ""
              },
              include_favicon: {
                type: "boolean",
                description: "Whether to include the favicon URL for each result",
                default: false
              }
            },
            required: ["query"]
          }
        },
        {
          name: "tavily_extract",
          description: "Extract content from URLs. Returns raw page content in markdown or text format.",
          inputSchema: {
            type: "object",
            properties: {
              urls: { 
                type: "array",
                items: { type: "string" },
                description: "List of URLs to extract content from"
              },
              extract_depth: { 
                type: "string",
                enum: ["basic", "advanced"],
                description: "Use 'advanced' for LinkedIn, protected sites, or tables/embedded content",
                default: "basic"
              },
              include_images: {
                type: "boolean",
                description: "Include images from pages",
                default: false
              },
              format: {
                type: "string",
                enum: ["markdown", "text"],
                description: "Output format",
                default: "markdown"
              },
              include_favicon: {
                type: "boolean",
                description: "Include favicon URLs",
                default: false
              },
              query: {
                type: "string",
                description: "Query to rerank content chunks by relevance"
              }
            },
            required: ["urls"]
          }
        },
        {
          name: "tavily_crawl",
          description: "Crawl a website starting from a URL. Extracts content from pages with configurable depth and breadth.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The root URL to begin the crawl"
              },
              max_depth: {
                type: "integer",
                description: "Max depth of the crawl. Defines how far from the base URL the crawler can explore.",
                default: 1,
                minimum: 1
              },
              max_breadth: {
                type: "integer",
                description: "Max number of links to follow per level of the tree (i.e., per page)",
                default: 20,
                minimum: 1
              },
              limit: {
                type: "integer",
                description: "Total number of links the crawler will process before stopping",
                default: 50,
                minimum: 1
              },
              instructions: {
                type: "string",
                description: "Natural language instructions for the crawler. Instructions specify which types of pages the crawler should return."
              },
              select_paths: {
                type: "array",
                items: { type: "string" },
                description: "Regex patterns to select only URLs with specific path patterns (e.g., /docs/.*, /api/v1.*)",
                default: []
              },
              select_domains: {
                type: "array",
                items: { type: "string" },
                description: "Regex patterns to restrict crawling to specific domains or subdomains (e.g., ^docs\\.example\\.com$)",
                default: []
              },
              allow_external: {
                type: "boolean",
                description: "Whether to return external links in the final response",
                default: true
              },
              extract_depth: {
                type: "string",
                enum: ["basic", "advanced"],
                description: "Advanced extraction retrieves more data, including tables and embedded content, with higher success but may increase latency",
                default: "basic"
              },
              format: {
                type: "string",
                enum: ["markdown","text"],
                description: "The format of the extracted web page content. markdown returns content in markdown format. text returns plain text and may increase latency.",
                default: "markdown"
              },
              include_favicon: { 
                type: "boolean", 
                description: "Whether to include the favicon URL for each result",
                default: false,
              },
            },
            required: ["url"]
          }
        },
        {
          name: "tavily_map",
          description: "Map a website's structure. Returns a list of URLs found starting from the base URL.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The root URL to begin the mapping"
              },
              max_depth: {
                type: "integer",
                description: "Max depth of the mapping. Defines how far from the base URL the crawler can explore",
                default: 1,
                minimum: 1
              },
              max_breadth: {
                type: "integer",
                description: "Max number of links to follow per level of the tree (i.e., per page)",
                default: 20,
                minimum: 1
              },
              limit: {
                type: "integer",
                description: "Total number of links the crawler will process before stopping",
                default: 50,
                minimum: 1
              },
              instructions: {
                type: "string",
                description: "Natural language instructions for the crawler"
              },
              select_paths: {
                type: "array",
                items: { type: "string" },
                description: "Regex patterns to select only URLs with specific path patterns (e.g., /docs/.*, /api/v1.*)",
                default: []
              },
              select_domains: {
                type: "array",
                items: { type: "string" },
                description: "Regex patterns to restrict crawling to specific domains or subdomains (e.g., ^docs\\.example\\.com$)",
                default: []
              },
              allow_external: {
                type: "boolean",
                description: "Whether to return external links in the final response",
                default: true
              }
            },
            required: ["url"]
          }
        },
{
          name: "tavily_research",
          description: "Perform comprehensive research on a given topic or question. Use this tool when you need to gather information from multiple sources to answer a question or complete a task. Returns a detailed response based on the research findings.",
          inputSchema: {
            type: "object",
            properties: {
              input: {
                type: "string",
                description: "A comprehensive description of the research task"
              },
              model: {
                type: "string",
                enum: ["mini", "pro", "auto"],
                description: "Defines the degree of depth of the research. 'mini' is good for narrow tasks with few subtopics. 'pro' is good for broad tasks with many subtopics. 'auto' automatically selects the best model.",
                default: "auto"
              }
            },
            required: ["input"]
          }
        },
        // Stripe Payment Tools
        {
          name: "stripe_create_payment_intent",
          description: "Create a Stripe payment intent. A payment intent represents your intent to collect payment from a customer. Requires STRIPE_SECRET_KEY environment variable to be set.",
          inputSchema: {
            type: "object",
            properties: {
              amount: {
                type: "number",
                description: "Amount to charge in cents (smallest currency unit). Example: 1000 for $10.00"
              },
              currency: {
                type: "string",
                description: "Three-letter ISO currency code (e.g., 'usd', 'eur')",
                default: "usd"
              },
              customer: {
                type: "string",
                description: "Customer ID to associate with the payment"
              },
              description: {
                type: "string",
                description: "Description of the payment"
              },
              metadata: {
                type: "object",
                description: "Additional metadata to store with the payment intent"
              }
            },
            required: ["amount"]
          }
        },
        {
          name: "stripe_get_payment_intent",
          description: "Retrieve a Stripe payment intent by its ID. Requires STRIPE_SECRET_KEY environment variable to be set.",
          inputSchema: {
            type: "object",
            properties: {
              payment_intent_id: {
                type: "string",
                description: "The ID of the payment intent to retrieve"
              }
            },
            required: ["payment_intent_id"]
          }
        },
        {
          name: "stripe_create_customer",
          description: "Create a new Stripe customer. Requires STRIPE_SECRET_KEY environment variable to be set.",
          inputSchema: {
            type: "object",
            properties: {
              email: {
                type: "string",
                description: "Customer's email address"
              },
              name: {
                type: "string",
                description: "Customer's name"
              },
              metadata: {
                type: "object",
                description: "Additional metadata to store with the customer"
              }
            },
            required: ["email"]
          }
        },
        {
          name: "stripe_get_customer",
          description: "Retrieve a Stripe customer by ID. Requires STRIPE_SECRET_KEY environment variable to be set.",
          inputSchema: {
            type: "object",
            properties: {
              customer_id: {
                type: "string",
                description: "The ID of the customer to retrieve"
              }
            },
            required: ["customer_id"]
          }
        },
        {
          name: "stripe_list_charges",
          description: "List Stripe charges (payments). Requires STRIPE_SECRET_KEY environment variable to be set.",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of charges to return",
                default: 10,
                maximum: 100
              },
              customer: {
                type: "string",
                description: "Filter charges by customer ID"
              }
            }
          }
        },
        {
          name: "stripe_create_checkout_session",
          description: "Create a Stripe checkout session for accepting payments. Requires STRIPE_SECRET_KEY environment variable to be set.",
          inputSchema: {
            type: "object",
            properties: {
              line_items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    price_data: {
                      type: "object",
                      properties: {
                        currency: { type: "string" },
                        product_data: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            description: { type: "string" }
                          }
                        },
                        unit_amount: { type: "number" }
                      }
                    },
                    quantity: { type: "number" }
                  }
                },
                description: "Array of line items for the checkout session"
              },
              mode: {
                type: "string",
                enum: ["payment", "subscription", "setup"],
                description: "The mode of the checkout session",
                default: "payment"
              },
              success_url: {
                type: "string",
                description: "URL to redirect to after successful payment"
              },
              cancel_url: {
                type: "string",
                description: "URL to redirect to if payment is cancelled"
              },
              customer_email: {
                type: "string",
                description: "Customer's email address"
              },
              metadata: {
                type: "object",
                description: "Additional metadata"
              }
            },
            required: ["success_url", "cancel_url"]
          }
        },
        {
          name: "stripe_get_checkout_session",
          description: "Retrieve a Stripe checkout session by ID. Requires STRIPE_SECRET_KEY environment variable to be set.",
          inputSchema: {
            type: "object",
            properties: {
              session_id: {
                type: "string",
                description: "The ID of the checkout session to retrieve"
              }
            },
            required: ["session_id"]
          }
        },
        // Cloudflare MCP Server Tools (Remote Servers)
        {
          name: "cloudflare_list_servers",
          description: "List available Cloudflare MCP servers that can be added to your MCP client. These are remote MCP servers that provide monitoring, analytics, and browsing capabilities.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "cloudflare_get_server_info",
          description: "Get connection information for a specific Cloudflare MCP server. Use this to get the server URL and configuration details.",
          inputSchema: {
            type: "object",
            properties: {
              service: {
                type: "string",
                enum: ["observability", "radar", "browser"],
                description: "The Cloudflare service to get info for"
              }
            },
            required: ["service"]
          }
        },
        // Eleven Labs MCP Server Tools
        {
          name: "elevenlabs_list_servers",
          description: "List available Eleven Labs MCP servers that can be added to your MCP client. Eleven Labs provides text-to-speech and voice synthesis capabilities.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "elevenlabs_get_server_info",
          description: "Get connection information for the Eleven Labs MCP server. Use this to get the server configuration details and setup instructions.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        // GitHub MCP Server Tools
        {
          name: "github_list_servers",
          description: "List available GitHub MCP servers that can be added to your MCP client. GitHub provides code scanning, issues, pull requests, and repository management capabilities.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "github_get_server_info",
          description: "Get connection information for the GitHub MCP server. Use this to get the server configuration details and setup instructions.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        // AgentQL MCP Server Tools
        {
          name: "agentql_query_data",
          description: "Extract structured data from any web page using AgentQL's GraphQL-like query language. Provide a URL and a query to get back structured JSON data. Requires AGENTQL_API_KEY environment variable.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The URL of the web page to query"
              },
              query: {
                type: "string",
                description: "The AgentQL query string using GraphQL-like syntax. Example: '{ products[] { name price rating } }'"
              },
              wait_for: {
                type: "number",
                description: "Number of seconds to wait for the page to load before querying",
                default: 0
              },
              is_scroll_to_bottom_enabled: {
                type: "boolean",
                description: "Whether to scroll to the bottom of the page before querying (useful for lazy-loaded content)",
                default: false
              },
              mode: {
                type: "string",
                enum: ["standard", "fast"],
                description: "Query mode: 'standard' for best accuracy, 'fast' for lower latency",
                default: "standard"
              },
              is_screenshot_mode: {
                type: "boolean",
                description: "Whether to take a screenshot of the page during querying",
                default: false
              }
            },
            required: ["url", "query"]
          }
        },
        {
          name: "agentql_get_web_element",
          description: "Locate and retrieve specific web elements from a page using AgentQL's query language. Returns element references useful for identifying interactive page components. Requires AGENTQL_API_KEY environment variable.",
          inputSchema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The URL of the web page to query"
              },
              query: {
                type: "string",
                description: "The AgentQL query string describing the elements to find. Example: '{ search_btn login_form { username_field password_field } }'"
              },
              wait_for: {
                type: "number",
                description: "Number of seconds to wait for the page to load before querying",
                default: 0
              },
              is_scroll_to_bottom_enabled: {
                type: "boolean",
                description: "Whether to scroll to the bottom of the page before querying",
                default: false
              },
              mode: {
                type: "string",
                enum: ["standard", "fast"],
                description: "Query mode: 'standard' for best accuracy, 'fast' for lower latency",
                default: "standard"
              },
              is_screenshot_mode: {
                type: "boolean",
                description: "Whether to take a screenshot of the page during querying",
                default: false
              }
            },
            required: ["url", "query"]
          }
        },
        {
          name: "agentql_list_servers",
          description: "List available AgentQL MCP tools and server information. AgentQL provides AI-powered web data extraction using a GraphQL-like query language.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "agentql_get_server_info",
          description: "Get connection information and setup instructions for the AgentQL MCP server. Returns npm package name, API key configuration, and available tools.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        // Alby Bitcoin Lightning MCP Server Tools
        {
          name: "alby_list_servers",
          description: "List available Alby MCP tools for Bitcoin Lightning wallet operations. Alby provides NWC-based lightning wallet capabilities including payments, invoices, and balance queries.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "alby_get_server_info",
          description: "Get connection information and setup instructions for the Alby Bitcoin Lightning MCP server. Returns npm package, NWC connection string configuration, remote server URLs, and available tools.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ];


      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      // Check for API key at request time and return proper JSON-RPC error
      if (!API_KEY) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          "TAVILY_API_KEY environment variable is required. Please set it before using this MCP server."
        );
      }

      try {
        let response: TavilyResponse;
        const args = request.params.arguments ?? {};

        switch (request.params.name) {
          case "tavily_search":
            // If country is set, ensure topic is general
            if (args.country) {
              args.topic = "general";
            }
            
            response = await this.search({
              query: args.query,
              search_depth: args.search_depth,
              topic: args.topic,
              time_range: args.time_range,
              max_results: args.max_results,
              include_images: args.include_images,
              include_image_descriptions: args.include_image_descriptions,
              include_raw_content: args.include_raw_content,
              include_domains: Array.isArray(args.include_domains) ? args.include_domains : [],
              exclude_domains: Array.isArray(args.exclude_domains) ? args.exclude_domains : [],
              country: args.country,
              include_favicon: args.include_favicon,
              start_date: args.start_date,
              end_date: args.end_date
            });
            break;
          
          case "tavily_extract":
            response = await this.extract({
              urls: args.urls,
              extract_depth: args.extract_depth,
              include_images: args.include_images,
              format: args.format,
              include_favicon: args.include_favicon,
              query: args.query,
            });
            break;

          case "tavily_crawl":
            const crawlResponse = await this.crawl({
              url: args.url,
              max_depth: args.max_depth,
              max_breadth: args.max_breadth,
              limit: args.limit,
              instructions: args.instructions,
              select_paths: Array.isArray(args.select_paths) ? args.select_paths : [],
              select_domains: Array.isArray(args.select_domains) ? args.select_domains : [],
              allow_external: args.allow_external,
              extract_depth: args.extract_depth,
              format: args.format,
              include_favicon: args.include_favicon,
              chunks_per_source: 3,
            });
            return {
              content: [{
                type: "text",
                text: formatCrawlResults(crawlResponse)
              }]
            };

          case "tavily_map":
            const mapResponse = await this.map({
              url: args.url,
              max_depth: args.max_depth,
              max_breadth: args.max_breadth,
              limit: args.limit,
              instructions: args.instructions,
              select_paths: Array.isArray(args.select_paths) ? args.select_paths : [],
              select_domains: Array.isArray(args.select_domains) ? args.select_domains : [],
              allow_external: args.allow_external
            });
            return {
              content: [{
                type: "text",
                text: formatMapResults(mapResponse)
              }]
            };

          case "tavily_research":
            const researchResponse = await this.research({
              input: args.input,
              model: args.model
            });
            return {
              content: [{
                type: "text",
text: formatResearchResults(researchResponse)
              }]
            };

          // Stripe payment tool handlers
          case "stripe_create_payment_intent":
            if (!isStripeConfigured()) {
              throw new McpError(ErrorCode.InvalidRequest, "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.");
            }
            try {
              const pi = await createPaymentIntent({
                amount: args.amount,
                currency: args.currency,
                customer: args.customer,
                description: args.description,
                metadata: args.metadata
              });
              return { content: [{ type: "text", text: formatStripePaymentIntent(pi) }] };
            } catch (err: any) {
              return { content: [{ type: "text", text: `Stripe error: ${err.message}` }], isError: true };
            }

          case "stripe_get_payment_intent":
            if (!isStripeConfigured()) {
              throw new McpError(ErrorCode.InvalidRequest, "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.");
            }
            try {
              const pi = await getPaymentIntent(args.payment_intent_id);
              return { content: [{ type: "text", text: formatStripePaymentIntent(pi) }] };
            } catch (err: any) {
              return { content: [{ type: "text", text: `Stripe error: ${err.message}` }], isError: true };
            }

          case "stripe_create_customer":
            if (!isStripeConfigured()) {
              throw new McpError(ErrorCode.InvalidRequest, "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.");
            }
            try {
              const c = await createCustomer({
                email: args.email,
                name: args.name,
                metadata: args.metadata
              });
              return { content: [{ type: "text", text: formatStripeCustomer(c) }] };
            } catch (err: any) {
              return { content: [{ type: "text", text: `Stripe error: ${err.message}` }], isError: true };
            }

          case "stripe_get_customer":
            if (!isStripeConfigured()) {
              throw new McpError(ErrorCode.InvalidRequest, "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.");
            }
            try {
              const c = await getCustomer(args.customer_id);
              return { content: [{ type: "text", text: formatStripeCustomer(c) }] };
            } catch (err: any) {
              return { content: [{ type: "text", text: `Stripe error: ${err.message}` }], isError: true };
            }

          case "stripe_list_charges":
            if (!isStripeConfigured()) {
              throw new McpError(ErrorCode.InvalidRequest, "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.");
            }
            try {
              const charges = await listCharges(args.limit, args.customer);
              return { content: [{ type: "text", text: formatStripeCharges(charges) }] };
            } catch (err: any) {
              return { content: [{ type: "text", text: `Stripe error: ${err.message}` }], isError: true };
            }

          case "stripe_create_checkout_session":
            if (!isStripeConfigured()) {
              throw new McpError(ErrorCode.InvalidRequest, "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.");
            }
            try {
              const s = await createCheckoutSession({
                lineItems: args.line_items,
                mode: args.mode,
                successUrl: args.success_url,
                cancelUrl: args.cancel_url,
                customerEmail: args.customer_email,
                metadata: args.metadata
              });
              return { content: [{ type: "text", text: formatStripeCheckoutSession(s) }] };
            } catch (err: any) {
              return { content: [{ type: "text", text: `Stripe error: ${err.message}` }], isError: true };
            }

          case "stripe_get_checkout_session":
            if (!isStripeConfigured()) {
              throw new McpError(ErrorCode.InvalidRequest, "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.");
            }
            try {
              const s = await getCheckoutSession(args.session_id);
              return { content: [{ type: "text", text: formatStripeCheckoutSession(s) }] };
            } catch (err: any) {
              return { content: [{ type: "text", text: `Stripe error: ${err.message}` }], isError: true };
            }

          // Cloudflare tool handlers
          case "cloudflare_list_servers":
            return {
              content: [{
                type: "text",
                text: formatCloudflareServers()
              }]
            };

          case "cloudflare_get_server_info":
            if (!args.service) {
              throw new McpError(ErrorCode.InvalidRequest, "Service parameter is required. Use 'observability', 'radar', or 'browser'.");
            }
            return {
              content: [{
                type: "text",
                text: formatCloudflareServerInfo(args.service)
              }]
            };

          // Eleven Labs tool handlers
          case "elevenlabs_list_servers":
            return {
              content: [{
                type: "text",
                text: formatElevenLabsServers()
              }]
            };

          case "elevenlabs_get_server_info":
            return {
              content: [{
                type: "text",
                text: formatElevenLabsServerInfo()
              }]
            };

          // GitHub tool handlers
          case "github_list_servers":
            return {
              content: [{
                type: "text",
                text: formatGitHubServers()
              }]
            };

          case "github_get_server_info":
            return {
              content: [{
                type: "text",
                text: formatGitHubServerInfo()
              }]
            };

          // AgentQL tool handlers
          case "agentql_list_servers":
            return {
              content: [{
                type: "text",
                text: formatAgentQLServers()
              }]
            };

          case "agentql_get_server_info":
            return {
              content: [{
                type: "text",
                text: formatAgentQLServerInfo()
              }]
            };

          case "agentql_query_data":
            if (!isAgentQLConfigured()) {
              throw new McpError(ErrorCode.InvalidRequest, "AgentQL is not configured. Please set AGENTQL_API_KEY environment variable.");
            }
            try {
              const agentqlQueryResult = await agentqlQueryData(
                args.url,
                args.query,
                {
                  wait_for: args.wait_for,
                  is_scroll_to_bottom_enabled: args.is_scroll_to_bottom_enabled,
                  mode: args.mode,
                  is_screenshot_mode: args.is_screenshot_mode
                }
              );
              return { content: [{ type: "text", text: formatAgentQLQueryResult(agentqlQueryResult) }] };
            } catch (err: any) {
              return { content: [{ type: "text", text: `AgentQL error: ${err.message}` }], isError: true };
            }

          case "agentql_get_web_element":
            if (!isAgentQLConfigured()) {
              throw new McpError(ErrorCode.InvalidRequest, "AgentQL is not configured. Please set AGENTQL_API_KEY environment variable.");
            }
            try {
              const agentqlWebElementResult = await agentqlGetWebElement(
                args.url,
                args.query,
                {
                  wait_for: args.wait_for,
                  is_scroll_to_bottom_enabled: args.is_scroll_to_bottom_enabled,
                  mode: args.mode,
                  is_screenshot_mode: args.is_screenshot_mode
                }
              );
              return { content: [{ type: "text", text: formatAgentQLWebElementResult(agentqlWebElementResult) }] };
            } catch (err: any) {
              return { content: [{ type: "text", text: `AgentQL error: ${err.message}` }], isError: true };
            }

          // Alby tool handlers
          case "alby_list_servers":
            return {
              content: [{
                type: "text",
                text: formatAlbyServers()
              }]
            };

          case "alby_get_server_info":
            return {
              content: [{
                type: "text",
                text: formatAlbyServerInfo()
              }]
            };

          default:


            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }

        return {
          content: [{
            type: "text",
            text: formatResults(response)
          }]
        };
      } catch (error: any) {
        if (axios.isAxiosError(error)) {
          return {
            content: [{
              type: "text",
              text: `Tavily API error: ${error.response?.data?.message ?? error.message}`
            }],
            isError: true,
          }
        }
        throw error;
      }
    });
  }


  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Tavily MCP server running on stdio");
  }

  async search(params: any): Promise<TavilyResponse> {
    try {
      const endpoint = this.baseURLs.search;
      
      const defaults = this.getDefaultParameters();
      
      // Prepare the request payload
      const searchParams: any = {
        query: params.query,
        search_depth: params.search_depth,
        topic: params.topic,
        time_range: params.time_range,
        max_results: params.max_results,
        include_images: params.include_images,
        include_image_descriptions: params.include_image_descriptions,
        include_raw_content: params.include_raw_content,
        include_domains: params.include_domains || [],
        exclude_domains: params.exclude_domains || [],
        country: params.country,
        include_favicon: params.include_favicon,
        start_date: params.start_date,
        end_date: params.end_date,
        api_key: API_KEY,
      };
      
      // Apply default parameters
      for (const key in searchParams) {
        if (key in defaults) {
          searchParams[key] = defaults[key];
        }
      }
      
      // We have to set defaults due to the issue with optional parameter types or defaults = None
      // Because of this, we have to set the time_range to None if start_date or end_date is set
      // or else start_date and end_date will always cause errors when sent
      if ((searchParams.start_date || searchParams.end_date) && searchParams.time_range) {
        searchParams.time_range = undefined;
      }
      
      // Remove empty values
      const cleanedParams: any = {};
      for (const key in searchParams) {
        const value = searchParams[key];
        // Skip empty strings, null, undefined, and empty arrays
        if (value !== "" && value !== null && value !== undefined && 
            !(Array.isArray(value) && value.length === 0)) {
          cleanedParams[key] = value;
        }
      }
      
      const response = await this.axiosInstance.post(endpoint, cleanedParams);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid API key');
      } else if (error.response?.status === 429) {
        throw new Error('Usage limit exceeded');
      }
      throw error;
    }
  }

  async extract(params: any): Promise<TavilyResponse> {
    try {
      const response = await this.axiosInstance.post(this.baseURLs.extract, {
        ...params,
        api_key: API_KEY
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid API key');
      } else if (error.response?.status === 429) {
        throw new Error('Usage limit exceeded');
      }
      throw error;
    }
  }

  async crawl(params: any): Promise<TavilyCrawlResponse> {
    try {
      const response = await this.axiosInstance.post(this.baseURLs.crawl, {
        ...params,
        api_key: API_KEY
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid API key');
      } else if (error.response?.status === 429) {
        throw new Error('Usage limit exceeded');
      }
      throw error;
    }
  }

  async map(params: any): Promise<TavilyMapResponse> {
    try {
      const response = await this.axiosInstance.post(this.baseURLs.map, {
        ...params,
        api_key: API_KEY
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid API key');
      } else if (error.response?.status === 429) {
        throw new Error('Usage limit exceeded');
      }
      throw error;
    }
  }

  async research(params: any): Promise<TavilyResearchResponse> {
    const INITIAL_POLL_INTERVAL = 2000; // 2 seconds in ms
    const MAX_POLL_INTERVAL = 10000; // 10 seconds in ms
    const POLL_BACKOFF_FACTOR = 1.5;
    const MAX_PRO_MODEL_POLL_DURATION = 900000; // 15 minutes in ms
    const MAX_MINI_MODEL_POLL_DURATION = 300000; // 5 minutes in ms

    try {
      const response = await this.axiosInstance.post(this.baseURLs.research, {
        input: params.input,
        model: params.model || 'auto',
        api_key: API_KEY
      });

      const requestId = response.data.request_id;
      if (!requestId) {
        return { error: 'No request_id returned from research endpoint' };
      }

      // For model=auto, use pro timeout since we don't know which model will be used
      const maxPollDuration = params.model === 'mini'
        ? MAX_MINI_MODEL_POLL_DURATION
        : MAX_PRO_MODEL_POLL_DURATION;

      let pollInterval = INITIAL_POLL_INTERVAL;
      let totalElapsed = 0;

      while (totalElapsed < maxPollDuration) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        totalElapsed += pollInterval;

        try {
          const pollResponse = await this.axiosInstance.get(
            `${this.baseURLs.research}/${requestId}`
          );

          const status = pollResponse.data.status;

          if (status === 'completed') {
            const content = pollResponse.data.content;
            return {
              content: content || ''
            };
          }

          if (status === 'failed') {
            return { error: 'Research task failed' };
          }

        } catch (pollError: any) {
          if (pollError.response?.status === 404) {
            return { error: 'Research task not found' };
          }
          throw pollError;
        }

        pollInterval = Math.min(pollInterval * POLL_BACKOFF_FACTOR, MAX_POLL_INTERVAL);
      }

      return { error: 'Research task timed out' };
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error('Invalid API key');
      } else if (error.response?.status === 429) {
        throw new Error('Usage limit exceeded');
      }
      throw error;
    }
  }
}

function formatResults(response: TavilyResponse): string {
  // Format API response into human-readable text
  const output: string[] = [];

  // Include answer if available
  if (response.answer) {
    output.push(`Answer: ${response.answer}`);
  }

  // Format detailed search results
  output.push('Detailed Results:');
  response.results.forEach(result => {
    output.push(`\nTitle: ${result.title}`);
    output.push(`URL: ${result.url}`);
    output.push(`Content: ${result.content}`);
    if (result.raw_content) {
      output.push(`Raw Content: ${result.raw_content}`);
    }
    if (result.favicon) {
      output.push(`Favicon: ${result.favicon}`);
    }
  });

    // Add images section if available
    if (response.images && response.images.length > 0) {
      output.push('\nImages:');
      response.images.forEach((image, index) => {
        if (typeof image === 'string') {
          output.push(`\n[${index + 1}] URL: ${image}`);
        } else {
          output.push(`\n[${index + 1}] URL: ${image.url}`);
          if (image.description) {
            output.push(`   Description: ${image.description}`);
          }
        }
      });
    }  

  return output.join('\n');
}

function formatCrawlResults(response: TavilyCrawlResponse): string {
  const output: string[] = [];
  
  output.push(`Crawl Results:`);
  output.push(`Base URL: ${response.base_url}`);
  
  output.push('\nCrawled Pages:');
  response.results.forEach((page, index) => {
    output.push(`\n[${index + 1}] URL: ${page.url}`);
    if (page.raw_content) {
      // Truncate content if it's too long
      const contentPreview = page.raw_content.length > 200 
        ? page.raw_content.substring(0, 200) + "..." 
        : page.raw_content;
      output.push(`Content: ${contentPreview}`);
    }
    if (page.favicon) {
      output.push(`Favicon: ${page.favicon}`);
    }
  });
  
  return output.join('\n');
}

function formatMapResults(response: TavilyMapResponse): string {
  const output: string[] = [];

  output.push(`Site Map Results:`);
  output.push(`Base URL: ${response.base_url}`);

  output.push('\nMapped Pages:');
  response.results.forEach((page, index) => {
    output.push(`\n[${index + 1}] URL: ${page}`);
  });

  return output.join('\n');
}

function formatResearchResults(response: TavilyResearchResponse): string {
  if (response.error) {
    return `Research Error: ${response.error}`;
  }

  return response.content || 'No research results available';
}

// Stripe format functions
function formatStripePaymentIntent(pi: any): string {
  const output: string[] = [];
  output.push('Payment Intent Created:');
  output.push(`ID: ${pi.id}`);
  output.push(`Amount: ${pi.amount} ${pi.currency?.toUpperCase()}`);
  output.push(`Status: ${pi.status}`);
  if (pi.client_secret) {
    output.push(`Client Secret: ${pi.client_secret.substring(0, 20)}...`);
  }
  if (pi.description) {
    output.push(`Description: ${pi.description}`);
  }
  if (pi.customer) {
    output.push(`Customer ID: ${pi.customer}`);
  }
  if (pi.metadata) {
    output.push(`Metadata: ${JSON.stringify(pi.metadata)}`);
  }
  return output.join('\n');
}

function formatStripeCustomer(customer: any): string {
  const output: string[] = [];
  output.push('Customer:');
  output.push(`ID: ${customer.id}`);
  if (customer.email) {
    output.push(`Email: ${customer.email}`);
  }
  if (customer.name) {
    output.push(`Name: ${customer.name}`);
  }
  if (customer.metadata) {
    output.push(`Metadata: ${JSON.stringify(customer.metadata)}`);
  }
  return output.join('\n');
}

function formatStripeCharges(charges: any): string {
  const output: string[] = [];
  output.push(`Found ${charges.data.length} charge(s):`);
  
  charges.data.forEach((charge: any, index: number) => {
    output.push(`\n[${index + 1}] Charge ID: ${charge.id}`);
    output.push(`    Amount: ${charge.amount} ${charge.currency?.toUpperCase()}`);
    output.push(`    Status: ${charge.status}`);
    output.push(`    Created: ${new Date(charge.created * 1000).toISOString()}`);
    if (charge.customer) {
      output.push(`    Customer: ${charge.customer}`);
    }
    if (charge.description) {
      output.push(`    Description: ${charge.description}`);
    }
  });
  
  return output.join('\n');
}

function formatStripeCheckoutSession(session: any): string {
  const output: string[] = [];
  output.push('Checkout Session:');
  output.push(`ID: ${session.id}`);
  output.push(`Mode: ${session.mode}`);
  output.push(`Status: ${session.payment_status}`);
  if (session.url) {
    output.push(`URL: ${session.url}`);
  }
  if (session.customer_email) {
    output.push(`Customer Email: ${session.customer_email}`);
  }
  if (session.metadata) {
    output.push(`Metadata: ${JSON.stringify(session.metadata)}`);
  }
  return output.join('\n');
}

// Cloudflare format functions
function formatCloudflareServers(): string {
  const output: string[] = [];
  output.push('Available Cloudflare MCP Servers:');
  output.push('');
  output.push('These are remote MCP servers that you can add to your MCP client configuration.');
  output.push('');
  
  const servers = listCloudflareServers();
  servers.forEach((server, index) => {
    output.push(`[${index + 1}] ${server.name}`);
    output.push(`    URL: ${server.url}`);
    output.push(`    Description: ${server.description}`);
    output.push('');
  });
  
  output.push('To add these servers to your MCP client, add them to your configuration file:');
  output.push('');
  output.push('Claude Desktop (claude_desktop_config.json):');
  output.push('  "mcpServers": {');
  output.push('    "cloudflare-observability": {');
  output.push('      "command": "npx",');
  output.push('      "args": ["-y", "@cloudflare/mcp-server"],');
  output.push('      "env": { "CLOUDFLARE_API_TOKEN": "your-api-token" }');
  output.push('    }');
  output.push('  }');
  output.push('');
  output.push('Or use the remote server approach with the URLs above.');
  
  return output.join('\n');
}

function formatCloudflareServerInfo(service: string): string {
  const output: string[] = [];
  
  const validServices = ['observability', 'radar', 'browser'];
  if (!validServices.includes(service)) {
    return `Invalid service: ${service}. Use one of: observability, radar, browser`;
  }
  
  const serverUrl = CLOUDFLARE_MCP_SERVERS[service as keyof typeof CLOUDFLARE_MCP_SERVERS];
  
  output.push(`Cloudflare ${service.charAt(0).toUpperCase() + service.slice(1)} MCP Server:`);
  output.push(`Server URL: ${serverUrl}`);
  output.push('');
  output.push('To connect to this server:');
  output.push('');
  output.push('1. Add the following to your MCP client configuration:');
  
  if (service === 'observability') {
    output.push('   Claude Desktop:');
    output.push('   {');
    output.push('     "mcpServers": {');
    output.push('       "cloudflare-observability": {');
    output.push('         "command": "npx",');
    output.push('         "args": ["-y", "@cloudflare/mcp-server"],');
    output.push('         "env": { "CLOUDFLARE_API_TOKEN": "your-api-token" }');
    output.push('       }');
    output.push('     }');
    output.push('   }');
    output.push('');
    output.push('   Or use remote server:');
    output.push('   {');
    output.push('     "mcpServers": {');
    output.push('       "cloudflare-observability": {');
    output.push('         "command": "npx",');
    output.push('         "args": ["-y", "mcp-remote", "https://observability.mcp.cloudflare.com/mcp"],');
    output.push('         "env": { "CLOUDFLARE_API_TOKEN": "your-api-token" }');
    output.push('       }');
    output.push('     }');
    output.push('   }');
  } else if (service === 'radar') {
    output.push('   Claude Desktop:');
    output.push('   {');
    output.push('     "mcpServers": {');
    output.push('       "cloudflare-radar": {');
    output.push('         "command": "npx",');
    output.push('         "args": ["-y", "@cloudflare/mcp-server"],');
    output.push('         "env": { "CLOUDFLARE_API_TOKEN": "your-api-token" }');
    output.push('       }');
    output.push('     }');
    output.push('   }');
    output.push('');
    output.push('   Or use remote server:');
    output.push('   {');
    output.push('     "mcpServers": {');
    output.push('       "cloudflare-radar": {');
    output.push('         "command": "npx",');
    output.push('         "args": ["-y", "mcp-remote", "https://radar.mcp.cloudflare.com/mcp"],');
    output.push('         "env": { "CLOUDFLARE_API_TOKEN": "your-api-token" }');
    output.push('       }');
    output.push('     }');
    output.push('   }');
  } else if (service === 'browser') {
    output.push('   Claude Desktop:');
    output.push('   {');
    output.push('     "mcpServers": {');
    output.push('       "cloudflare-browser": {');
    output.push('         "command": "npx",');
    output.push('         "args": ["-y", "@cloudflare/mcp-server"],');
    output.push('         "env": { "CLOUDFLARE_API_TOKEN": "your-api-token" }');
    output.push('       }');
    output.push('     }');
    output.push('   }');
    output.push('');
    output.push('   Or use remote server:');
    output.push('   {');
    output.push('     "mcpServers": {');
    output.push('       "cloudflare-browser": {');
    output.push('         "command": "npx",');
    output.push('         "args": ["-y", "mcp-remote", "https://browser.mcp.cloudflare.com/mcp"],');
    output.push('         "env": { "CLOUDFLARE_API_TOKEN": "your-api-token" }');
    output.push('       }');
    output.push('     }');
    output.push('   }');
  }
  
  output.push('');
  output.push('2. Replace "your-api-token" with your Cloudflare API token.');
  output.push('   Get your token from: https://dash.cloudflare.com/profile/api-tokens');
  
  return output.join('\n');
}

// Eleven Labs format functions
function formatElevenLabsServers(): string {
  const output: string[] = [];
  output.push('Available Eleven Labs MCP Server:');
  output.push('');
  output.push('Eleven Labs provides text-to-speech and voice synthesis capabilities.');
  output.push('');
  
  const servers = listElevenLabsServers();
  servers.forEach((server, index) => {
    output.push(`[${index + 1}] ${server.name}`);
    output.push(`    Description: ${server.description}`);
    output.push('');
  });
  
  output.push('To add Eleven Labs MCP server to your MCP client:');
  output.push('');
  output.push('Claude Desktop (claude_desktop_config.json):');
  output.push('  "mcpServers": {');
  output.push('    "elevenlabs": {');
  output.push('      "command": "npx",');
  output.push('      "args": ["-y", "@elevenlabs/mcp-server"],');
  output.push('      "env": { "ELEVENLABS_API_KEY": "your-api-key" }');
  output.push('    }');
  output.push('  }');
  output.push('');
  output.push('Get your Eleven Labs API key from: https://elevenlabs.io/app/settings/api-keys');
  
  return output.join('\n');
}

function formatElevenLabsServerInfo(): string {
  const output: string[] = [];
  const config = getElevenLabsConfig();
  
  output.push('Eleven Labs MCP Server Information:');
  output.push('');
  output.push(`Package: ${config.npmPackage}`);
  output.push(`Command: ${config.npmCommand}`);
  output.push(`API Key Environment Variable: ${config.apiKeyEnvVar}`);
  output.push('');
  output.push('Available Tools:');
  output.push('  - elevenlabs-text-to-speech: Convert text to speech');
  output.push('  - elevenlabs-voices: List available voices');
  output.push('  - elevenlabs-models: List available TTS models');
  output.push('  - elevenlabs-settings: Get or set user preferences');
  output.push('');
  output.push('Setup Instructions:');
  output.push('1. Get your API key from https://elevenlabs.io/app/settings/api-keys');
  output.push(`2. Set the environment variable: ${config.apiKeyEnvVar}=your-api-key`);
  output.push('3. Add the server to your MCP client configuration');
  output.push('');
  output.push('Documentation: https://elevenlabs.io/docs');
  output.push('GitHub: https://github.com/elevenlabs/elevenlabs-mcp');
  
  return output.join('\n');
}

// GitHub format functions
function formatGitHubServers(): string {
  const output: string[] = [];
  output.push('Available GitHub MCP Server:');
  output.push('');
  output.push('GitHub provides code scanning, issues, pull requests, and repository management capabilities.');
  output.push('');
  
  const servers = listGitHubServers();
  servers.forEach((server, index) => {
    output.push(`[${index + 1}] ${server.name}`);
    output.push(`    Description: ${server.description}`);
    output.push('');
  });
  
  output.push('To add GitHub MCP server to your MCP client:');
  output.push('');
  output.push('Claude Desktop (claude_desktop_config.json):');
  output.push('  "mcpServers": {');
  output.push('    "github": {');
  output.push('      "command": "npx",');
  output.push('      "args": ["-y", "@github/mcp-server"],');
  output.push('      "env": { "GITHUB_TOKEN": "your-github-token" }');
  output.push('    }');
  output.push('  }');
  output.push('');
  output.push('Get your GitHub token from: https://github.com/settings/tokens');
  
  return output.join('\n');
}

function formatGitHubServerInfo(): string {
  const output: string[] = [];
  const config = getGitHubConfig();
  
  output.push('GitHub MCP Server Information:');
  output.push('');
  output.push(`Package: ${config.npmPackage}`);
  output.push(`Command: ${config.command}`);
  output.push(`API Token Environment Variable: GITHUB_TOKEN`);
  output.push(`Configured: ${config.configured ? 'Yes' : 'No'}`);
  output.push('');
  output.push('Available Tools:');
  output.push('  - github-code-scanning: Security vulnerability detection');
  output.push('  - github-issues: Create, read, update, and search issues');
  output.push('  - github-pull-requests: Create, read, update, and search PRs');
  output.push('  - github-repositories: Manage repositories, branches, and commits');
  output.push('  - github-search: Search code, issues, PRs, and repositories');
  output.push('  - github-actions: Manage workflows and runs');
  output.push('');
  output.push('Setup Instructions:');
  output.push('1. Get your GitHub token from https://github.com/settings/tokens');
  output.push('2. Set the environment variable: GITHUB_TOKEN=your-github-token');
  output.push('3. Add the server to your MCP client configuration');
  output.push('');
  output.push('Documentation: https://github.com/github/github-mcp-server');
  
  return output.join('\n');
}

// AgentQL format functions
function formatAgentQLServers(): string {
  const output: string[] = [];
  output.push('Available AgentQL MCP Server:');
  output.push('');
  output.push('AgentQL provides AI-powered web scraping and data extraction capabilities.');
  output.push('');
  
  const servers = listAgentQLServers();
  servers.forEach((server, index) => {
    output.push(`[${index + 1}] ${server.name}`);
    output.push(`    Description: ${server.description}`);
    output.push('');
  });
  
  output.push('To add AgentQL MCP server to your MCP client:');
  output.push('');
  output.push('Claude Desktop (claude_desktop_config.json):');
  output.push('  "mcpServers": {');
  output.push('    "agentql": {');
  output.push('      "command": "npx",');
  output.push('      "args": ["-y", "agentql-mcp"],');
  output.push('      "env": { "AGENTQL_API_KEY": "your-api-key" }');
  output.push('    }');
  output.push('  }');
  output.push('');
  output.push('Get your AgentQL API key from: https://agentql.com');
  
  return output.join('\n');
}

function formatAgentQLServerInfo(): string {
  const output: string[] = [];
  const config = getAgentQLConfig();
  
  output.push('AgentQL MCP Server Information:');
  output.push('');
  output.push(`Package: ${config.npmPackage}`);
  output.push(`Command: ${config.command}`);
  output.push(`API Key Environment Variable: AGENTQL_API_KEY`);
  output.push(`Configured: ${config.configured ? 'Yes' : 'No'}`);
  output.push('');
  output.push('Available Tools:');
  output.push('  - query_data: Extract structured data from any web page using AgentQL query language');
  output.push('  - get_web_element: Get web elements from a page using natural language queries');
  output.push('');
  output.push('Setup Instructions:');
  output.push('1. Get your API key from https://agentql.com');
  output.push('2. Set the environment variable: AGENTQL_API_KEY=your-api-key');
  output.push('3. Add the server to your MCP client configuration');
  output.push('');
  output.push('GitHub: https://github.com/tinyfish-io/agentql-mcp');
  
  return output.join('\n');
}



// Alby format functions
function formatAlbyServers(): string {
  const output: string[] = [];
  output.push('Available Alby Bitcoin Lightning MCP Server:');
  output.push('');
  output.push('Alby provides Bitcoin Lightning wallet operations via Nostr Wallet Connect (NWC).');
  output.push('');

  const servers = listAlbyServers();
  const nwcTools = servers.slice(0, 7);
  const lightningTools = servers.slice(7);

  output.push('NWC Wallet Tools:');
  nwcTools.forEach((server, index) => {
    output.push(`  [${index + 1}] ${server.name}`);
    output.push(`      ${server.description}`);
  });
  output.push('');
  output.push('Lightning Tools:');
  lightningTools.forEach((server, index) => {
    output.push(`  [${index + 8}] ${server.name}`);
    output.push(`      ${server.description}`);
  });
  output.push('');
  output.push('To add Alby MCP server to your MCP client:');
  output.push('');
  output.push('Claude Desktop (claude_desktop_config.json):');
  output.push('  "mcpServers": {');
  output.push('    "alby": {');
  output.push('      "command": "npx",');
  output.push('      "args": ["-y", "@getalby/mcp"],');
  output.push('      "env": { "NWC_CONNECTION_STRING": "nostr+walletconnect://..." }');
  output.push('    }');
  output.push('  }');
  output.push('');
  output.push('Or connect to the remote Alby MCP server:');
  output.push(`  HTTP Streamable: ${ALBY_MCP_SERVER.remoteUrls.httpStreamable}`);
  output.push(`  SSE:             ${ALBY_MCP_SERVER.remoteUrls.sse}`);
  output.push('');
  output.push('Get your NWC connection string from: https://nwc.getalby.com');

  return output.join('\n');
}

function formatAlbyServerInfo(): string {
  const output: string[] = [];
  const config = getAlbyConfig();

  output.push('Alby Bitcoin Lightning MCP Server Information:');
  output.push('');
  output.push(`Package: ${config.npmPackage}`);
  output.push(`Command: ${config.command} ${config.args.join(' ')}`);
  output.push(`Auth Environment Variable: NWC_CONNECTION_STRING`);
  output.push(`Configured: ${config.configured ? 'Yes' : 'No'}`);
  output.push('');
  output.push('Remote Server URLs:');
  output.push(`  HTTP Streamable: ${ALBY_MCP_SERVER.remoteUrls.httpStreamable}`);
  output.push(`  SSE (deprecated): ${ALBY_MCP_SERVER.remoteUrls.sse}`);
  output.push('');
  output.push('Available Tools (11 total):');
  output.push('  NWC Wallet Tools:');
  output.push('  - get_balance: Get the balance of the connected lightning wallet');
  output.push('  - get_info: Get NWC capabilities and wallet/node information');
  output.push('  - get_wallet_service_info: Get NWC capabilities and supported encryption types');
  output.push('  - lookup_invoice: Look up a lightning invoice by BOLT-11 or payment hash');
  output.push('  - make_invoice: Create a lightning invoice');
  output.push('  - pay_invoice: Pay a lightning invoice');
  output.push('  - list_transactions: List wallet transactions with optional filtering');
  output.push('  Lightning Tools:');
  output.push('  - fetch_l402: Fetch a paid resource protected by L402');
  output.push('  - fiat_to_sats: Convert fiat currency amounts to satoshis');
  output.push('  - parse_invoice: Parse a BOLT-11 lightning invoice');
  output.push('  - request_invoice: Request an invoice from a lightning address');
  output.push('');
  output.push('Setup Instructions:');
  output.push('1. Get a NWC connection string from https://nwc.getalby.com or any NWC-compatible wallet');
  output.push('2. Set the environment variable: NWC_CONNECTION_STRING=nostr+walletconnect://...');
  output.push('3. Add the server to your MCP client configuration');
  output.push('');
  output.push('Remote Server Authentication:');
  output.push('  Bearer: Authorization: Bearer nostr+walletconnect://...');
  output.push('  Query param: https://mcp.getalby.com/mcp?nwc=ENCODED_NWC_URL');
  output.push('');
  output.push('GitHub: https://github.com/getAlby/mcp');

  return output.join('\n');
}

// AgentQL format helper functions
function formatAgentQLQueryResult(result: any): string {
  const output: string[] = [];
  output.push('AgentQL Query Data Result:');
  output.push('');
  if (result.data) {
    output.push('Data:');
    output.push(JSON.stringify(result.data, null, 2));
  }
  if (result.metadata) {
    output.push('');
    output.push('Metadata:');
    if (result.metadata.request_id) {
      output.push(`  Request ID: ${result.metadata.request_id}`);
    }
    const otherMeta = Object.entries(result.metadata).filter(([k]) => k !== 'request_id');
    if (otherMeta.length > 0) {
      otherMeta.forEach(([k, v]) => output.push(`  ${k}: ${JSON.stringify(v)}`));
    }
  }
  return output.join('\n');
}

function formatAgentQLWebElementResult(result: any): string {
  const output: string[] = [];
  output.push('AgentQL Web Element Result:');
  output.push('');
  if (result.data) {
    output.push('Elements:');
    output.push(JSON.stringify(result.data, null, 2));
  }
  if (result.metadata) {
    output.push('');
    output.push('Metadata:');
    if (result.metadata.request_id) {
      output.push(`  Request ID: ${result.metadata.request_id}`);
    }
    const otherMeta = Object.entries(result.metadata).filter(([k]) => k !== 'request_id');
    if (otherMeta.length > 0) {
      otherMeta.forEach(([k, v]) => output.push(`  ${k}: ${JSON.stringify(v)}`));
    }
  }
  return output.join('\n');
}

function listTools(): void {
  const tools = [
    {
      name: "tavily_search",
      description: "A real-time web search tool powered by Tavily's AI engine. Features include customizable search depth (basic/advanced/fast/ultra-fast), domain filtering, time-based filtering, and support for both general and news-specific searches. Returns comprehensive results with titles, URLs, content snippets, and optional image results."
    },
    {
      name: "tavily_extract",
      description: "Extracts and processes content from specified URLs with advanced parsing capabilities. Supports both basic and advanced extraction modes, with the latter providing enhanced data retrieval including tables and embedded content. Ideal for data collection, content analysis, and research tasks."
    },
    {
      name: "tavily_crawl",
      description: "A sophisticated web crawler that systematically explores websites starting from a base URL. Features include configurable depth and breadth limits, domain filtering, path pattern matching, and category-based filtering. Perfect for comprehensive site analysis, content discovery, and structured data collection."
    },
    {
      name: "tavily_map",
      description: "Creates detailed site maps by analyzing website structure and navigation paths. Offers configurable exploration depth, domain restrictions, and category filtering. Ideal for site audits, content organization analysis, and understanding website architecture and navigation patterns."
    },
    {
      name: "tavily_research",
      description: "Performs comprehensive research on any topic or question by gathering information from multiple sources. Supports different research depths ('mini' for narrow tasks, 'pro' for broad research, 'auto' for automatic selection). Ideal for in-depth analysis, report generation, and answering complex questions requiring synthesis of multiple sources."
    }
  ];

  console.log("Available tools:");
  tools.forEach(tool => {
    console.log(`\n- ${tool.name}`);
    console.log(`  Description: ${tool.description}`);
  });
  process.exit(0);
}

// Add this interface before the command line parsing
interface Arguments {
  'list-tools': boolean;
  _: (string | number)[];
  $0: string;
}

// Modify the command line parsing section to use proper typing
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
}

// Otherwise start the server
const server = new TavilyClient();
server.run().catch(console.error);
