#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {CallToolRequestSchema, ListToolsRequestSchema, Tool} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { createServer } from 'http';

dotenv.config();

// Transport configuration from environment
const TRANSPORT_TYPE = (process.env.TRANSPORT || "stdio") as "stdio" | "http";
const HTTP_PORT = parseInt(process.env.PORT || "8080", 10);

// Global variable to store current API key for HTTP requests
let currentApiKey: string | undefined = undefined;

// Helper function to get API key from environment or current request
const getApiKey = () => {
  return process.env.TAVILY_API_KEY || currentApiKey;
};

// Validate API key exists (only for stdio mode, HTTP mode handles per-request)
if (TRANSPORT_TYPE === "stdio") {
  const API_KEY = process.env.TAVILY_API_KEY;
  if (!API_KEY) {
    throw new Error("TAVILY_API_KEY environment variable is required");
  }
}


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

interface TavilyMapResponse {
  base_url: string;
  results: string[];
  response_time: number;
}

// Function to create a new server instance
function createServerInstance() {
  const server = new Server(
    {
      name: "tavily-mcp",
      version: "0.2.9",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const axiosInstance = axios.create({
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
      'X-Client-Source': 'MCP'
    }
  });

  const baseURLs = {
    search: 'https://api.tavily.com/search',
    extract: 'https://api.tavily.com/extract',
    crawl: 'https://api.tavily.com/crawl',
    map: 'https://api.tavily.com/map'
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Define available tools: tavily-search and tavily-extract
    const tools: Tool[] = [
      {
        name: "tavily-search",
        description: "A powerful web search tool that provides comprehensive, real-time results using Tavily's AI search engine. Returns relevant web content with customizable parameters for result count, content type, and domain filtering. Ideal for gathering current information, news, and detailed web content analysis.",
        inputSchema: {
          type: "object",
          properties: {
            query: { 
              type: "string", 
              description: "Search query" 
            },
            search_depth: {
              type: "string",
              enum: ["basic","advanced"],
              description: "The depth of the search. It can be 'basic' or 'advanced'",
              default: "basic"
            },
            topic : {
              type: "string",
              enum: ["general","news"],
              description: "The category of the search. This will determine which of our agents will be used for the search",
              default: "general"
            },
            days: {
              type: "number",
              description: "The number of days back from the current date to include in the search results. This specifies the time frame of data to be retrieved. Please note that this feature is only available when using the 'news' search topic",
              default: 3
            },
            time_range: {
              type: "string",
              description: "The time range back from the current date to include in the search results. This feature is available for both 'general' and 'news' search topics",
              enum: ["day", "week", "month", "year", "d", "w", "m", "y"],
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
              default: 10,
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
              default: false,
            },
            include_raw_content: { 
              type: "boolean", 
              description: "Include the cleaned and parsed HTML content of each search result",
              default: false,
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
              enum: ['afghanistan', 'albania', 'algeria', 'andorra', 'angola', 'argentina', 'armenia', 'australia', 'austria', 'azerbaijan', 'bahamas', 'bahrain', 'bangladesh', 'barbados', 'belarus', 'belgium', 'belize', 'benin', 'bhutan', 'bolivia', 'bosnia and herzegovina', 'botswana', 'brazil', 'brunei', 'bulgaria', 'burkina faso', 'burundi', 'cambodia', 'cameroon', 'canada', 'cape verde', 'central african republic', 'chad', 'chile', 'china', 'colombia', 'comoros', 'congo', 'costa rica', 'croatia', 'cuba', 'cyprus', 'czech republic', 'denmark', 'djibouti', 'dominican republic', 'ecuador', 'egypt', 'el salvador', 'equatorial guinea', 'eritrea', 'estonia', 'ethiopia', 'fiji', 'finland', 'france', 'gabon', 'gambia', 'georgia', 'germany', 'ghana', 'greece', 'guatemala', 'guinea', 'haiti', 'honduras', 'hungary', 'iceland', 'india', 'indonesia', 'iran', 'iraq', 'ireland', 'israel', 'italy', 'jamaica', 'japan', 'jordan', 'kazakhstan', 'kenya', 'kuwait', 'kyrgyzstan', 'latvia', 'lebanon', 'lesotho', 'liberia', 'libya', 'liechtenstein', 'lithuania', 'luxembourg', 'madagascar', 'malawi', 'malaysia', 'maldives', 'mali', 'malta', 'mauritania', 'mauritius', 'mexico', 'moldova', 'monaco', 'mongolia', 'montenegro', 'morocco', 'mozambique', 'myanmar', 'namibia', 'nepal', 'netherlands', 'new zealand', 'nicaragua', 'niger', 'nigeria', 'north korea', 'north macedonia', 'norway', 'oman', 'pakistan', 'panama', 'papua new guinea', 'paraguay', 'peru', 'philippines', 'poland', 'portugal', 'qatar', 'romania', 'russia', 'rwanda', 'saudi arabia', 'senegal', 'serbia', 'singapore', 'slovakia', 'slovenia', 'somalia', 'south africa', 'south korea', 'south sudan', 'spain', 'sri lanka', 'sudan', 'sweden', 'switzerland', 'syria', 'taiwan', 'tajikistan', 'tanzania', 'thailand', 'togo', 'trinidad and tobago', 'tunisia', 'turkey', 'turkmenistan', 'uganda', 'ukraine', 'united arab emirates', 'united kingdom', 'united states', 'uruguay', 'uzbekistan', 'venezuela', 'vietnam', 'yemen', 'zambia', 'zimbabwe'],
              description: "Boost search results from a specific country. This will prioritize content from the selected country in the search results. Available only if topic is general. Country names MUST be written in lowercase, plain English, with spaces and no underscores.",
              default: ""
            },
            include_favicon: { 
              type: "boolean", 
              description: "Whether to include the favicon URL for each result",
              default: false,
            }
          },
          required: ["query"]
        }
      },
      {
        name: "tavily-extract",
        description: "A powerful web content extraction tool that retrieves and processes raw content from specified URLs, ideal for data collection, content analysis, and research tasks.",
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
              enum: ["basic","advanced"],
              description: "Depth of extraction - 'basic' or 'advanced', if usrls are linkedin use 'advanced' or if explicitly told to use advanced",
              default: "basic"
            },
            include_images: { 
              type: "boolean", 
              description: "Include a list of images extracted from the urls in the response",
              default: false,
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
          required: ["urls"]
        }
      },
      {
        name: "tavily-crawl",
        description: "A powerful web crawler that initiates a structured web crawl starting from a specified base URL. The crawler expands from that point like a tree, following internal links across pages. You can control how deep and wide it goes, and guide it to focus on specific sections of the site.",
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
              description: "Regex patterns to select crawling to specific domains or subdomains (e.g., ^docs\\.example\\.com$)",
              default: []
            },
            allow_external: {
              type: "boolean",
              description: "Whether to allow following links that go to external domains",
              default: false
            },
            categories: {
              type: "array",
              items: { 
                type: "string",
                enum: ["Careers", "Blog", "Documentation", "About", "Pricing", "Community", "Developers", "Contact", "Media"]
              },
              description: "Filter URLs using predefined categories like documentation, blog, api, etc",
              default: []
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
        name: "tavily-map",
        description: "A powerful web mapping tool that creates a structured map of website URLs, allowing you to discover and analyze site structure, content organization, and navigation paths. Perfect for site audits, content discovery, and understanding website architecture.",
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
              description: "Regex patterns to select crawling to specific domains or subdomains (e.g., ^docs\\.example\\.com$)",
              default: []
            },
            allow_external: {
              type: "boolean",
              description: "Whether to allow following links that go to external domains",
              default: false
            },
            categories: {
              type: "array",
              items: { 
                type: "string",
                enum: ["Careers", "Blog", "Documentation", "About", "Pricing", "Community", "Developers", "Contact", "Media"]
              },
              description: "Filter URLs using predefined categories like documentation, blog, api, etc",
              default: []
            }
          },
          required: ["url"]
        }
      },
    ];
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      let response: TavilyResponse;
      const args = request.params.arguments ?? {};

      switch (request.params.name) {
        case "tavily-search":
          // If country is set, ensure topic is general
          if (args.country) {
            args.topic = "general";
          }
          
          response = await search({
            query: args.query,
            search_depth: args.search_depth,
            topic: args.topic,
            days: args.days,
            time_range: args.time_range,
            max_results: args.max_results,
            include_images: args.include_images,
            include_image_descriptions: args.include_image_descriptions,
            include_raw_content: args.include_raw_content,
            include_domains: Array.isArray(args.include_domains) ? args.include_domains : [],
            exclude_domains: Array.isArray(args.exclude_domains) ? args.exclude_domains : [],
            country: args.country,
            include_favicon: args.include_favicon
          }, axiosInstance, baseURLs);
          break;
        
        case "tavily-extract":
          response = await extract({
            urls: args.urls,
            extract_depth: args.extract_depth,
            include_images: args.include_images,
            format: args.format,
            include_favicon: args.include_favicon
          }, axiosInstance, baseURLs);
          break;

        case "tavily-crawl":
          const crawlResponse = await crawl({
            url: args.url,
            max_depth: args.max_depth,
            max_breadth: args.max_breadth,
            limit: args.limit,
            instructions: args.instructions,
            select_paths: Array.isArray(args.select_paths) ? args.select_paths : [],
            select_domains: Array.isArray(args.select_domains) ? args.select_domains : [],
            allow_external: args.allow_external,
            categories: Array.isArray(args.categories) ? args.categories : [],
            extract_depth: args.extract_depth,
            format: args.format,
            include_favicon: args.include_favicon
          }, axiosInstance, baseURLs);
          return {
            content: [{
              type: "text",
              text: formatCrawlResults(crawlResponse)
            }]
          };

        case "tavily-map":
          const mapResponse = await map({
            url: args.url,
            max_depth: args.max_depth,
            max_breadth: args.max_breadth,
            limit: args.limit,
            instructions: args.instructions,
            select_paths: Array.isArray(args.select_paths) ? args.select_paths : [],
            select_domains: Array.isArray(args.select_domains) ? args.select_domains : [],
            allow_external: args.allow_external,
            categories: Array.isArray(args.categories) ? args.categories : []
          }, axiosInstance, baseURLs);
          return {
            content: [{
              type: "text",
              text: formatMapResults(mapResponse)
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

  server.onerror = (error) => {
    console.error("[MCP Error]", error);
  };

  return server;
}

async function search(params: any, axiosInstance: any, baseURLs: any): Promise<TavilyResponse> {
  try {
    const endpoint = baseURLs.search;

    const searchParams = {
      ...params,
      api_key: getApiKey(),
    };
    
    const response = await axiosInstance.post(endpoint, searchParams);
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

async function extract(params: any, axiosInstance: any, baseURLs: any): Promise<TavilyResponse> {
  try {
    const response = await axiosInstance.post(baseURLs.extract, {
      ...params,
      api_key: getApiKey()
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

async function crawl(params: any, axiosInstance: any, baseURLs: any): Promise<TavilyCrawlResponse> {
  try {
    const response = await axiosInstance.post(baseURLs.crawl, {
      ...params,
      api_key: getApiKey()
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

async function map(params: any, axiosInstance: any, baseURLs: any): Promise<TavilyMapResponse> {
  try {
    const response = await axiosInstance.post(baseURLs.map, {
      ...params,
      api_key: getApiKey()
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

function listTools(): void {
  const tools = [
    {
      name: "tavily-search",
      description: "A real-time web search tool powered by Tavily's AI engine. Features include customizable search depth (basic/advanced), domain filtering, time-based filtering, and support for both general and news-specific searches. Returns comprehensive results with titles, URLs, content snippets, and optional image results."
    },
    {
      name: "tavily-extract",
      description: "Extracts and processes content from specified URLs with advanced parsing capabilities. Supports both basic and advanced extraction modes, with the latter providing enhanced data retrieval including tables and embedded content. Ideal for data collection, content analysis, and research tasks."
    },
    {
      name: "tavily-crawl",
      description: "A sophisticated web crawler that systematically explores websites starting from a base URL. Features include configurable depth and breadth limits, domain filtering, path pattern matching, and category-based filtering. Perfect for comprehensive site analysis, content discovery, and structured data collection."
    },
    {
      name: "tavily-map",
      description: "Creates detailed site maps by analyzing website structure and navigation paths. Offers configurable exploration depth, domain restrictions, and category filtering. Ideal for site audits, content organization analysis, and understanding website architecture and navigation patterns."
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

async function main() {
  const transportType = TRANSPORT_TYPE;

  if (transportType === "http") {
    const httpServer = createServer(async (req, res) => {
      const url = new URL(req.url || "", `http://${req.headers.host}`).pathname;

      // Set CORS headers for all responses
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,DELETE");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, MCP-Session-Id, mcp-session-id");

      // Handle preflight OPTIONS requests
      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      try {
        // Extract config from base64-encoded JSON parameter for Smithery compatibility
        const fullUrl = new URL(req.url || "", `http://${req.headers.host}`);
        const configParam = fullUrl.searchParams.get('config');
        
        if (configParam) {
          try {
            const decodedConfig = Buffer.from(configParam, 'base64').toString('utf-8');
            const config = JSON.parse(decodedConfig);
            
            if (config.tavilyApiKey) {
              currentApiKey = config.tavilyApiKey;
            }
          } catch (error) {
            console.error('Failed to parse config parameter:', error);
          }
        }

        // Create new server instance for each request
        const requestServer = createServerInstance();

        if (url === "/mcp") {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          });
          await requestServer.connect(transport);
          await transport.handleRequest(req, res);
        } else if (url === "/ping") {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("pong");
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      } catch (error) {
        console.error("Error handling request:", error);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal Server Error");
        }
      } finally {
        // Clear config after request processing
        currentApiKey = undefined;
      }
    });

    httpServer.listen(HTTP_PORT, () => {
      console.error(
        `Tavily MCP Server running on HTTP at http://localhost:${HTTP_PORT}/mcp`
      );
    });
  } else {
    // Stdio transport (default)
    const server = createServerInstance();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Tavily MCP server running on stdio");
  }
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

process.on('SIGINT', async () => {
  process.exit(0);
});

// Otherwise start the server
main().catch((error) => {
  console.error('Fatal error running server:', error);
  process.exit(1);
});

// Export the server for smithery
export default function () {
  const server = createServerInstance();
  return server;
}