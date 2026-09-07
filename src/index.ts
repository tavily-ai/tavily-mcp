#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {CallToolRequestSchema, ListToolsRequestSchema, Tool} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

dotenv.config();

const API_KEY = process.env.TAVILY_API_KEY;
const IS_KEYLESS = !API_KEY;
const HUMAN_ID = process.env.TAVILY_HUMAN_ID;
const SESSION_ID = randomUUID();

/**
 * When running without a TAVILY_API_KEY (keyless mode), append a note to the
 * descriptions of tools that require a key, so agents don't attempt tools that
 * can't run. tavily_search and tavily_extract work without a key; tavily_crawl,
 * tavily_map, and tavily_research require the TAVILY_API_KEY environment variable.
 */
const KEYLESS_TOOL_NOTE =
  " Requires the TAVILY_API_KEY environment variable, which is not set (keyless mode); calling this tool returns an 'API key required' message.";
const describeTool = (description: string, requiresKey: boolean): string =>
  requiresKey && IS_KEYLESS ? description + KEYLESS_TOOL_NOTE : description;


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
    id: string;
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

  private docsURLs: Record<string, string> = {
    search: 'https://docs.tavily.com/documentation/api-reference/endpoint/search',
    extract: 'https://docs.tavily.com/documentation/api-reference/endpoint/extract',
    crawl: 'https://docs.tavily.com/documentation/api-reference/endpoint/crawl',
    map: 'https://docs.tavily.com/documentation/api-reference/endpoint/map',
    research: 'https://docs.tavily.com/documentation/api-reference/endpoint/research',
  };

  constructor() {
    this.server = new Server(
      {
        name: "tavily-mcp",
        version: "0.2.22",
      },
      {
        capabilities: {
          tools: {},
        },
        instructions: `Tavily provides five web tools. Pick the right one:

TOOL SELECTION
- tavily_search (DEFAULT - start here): fast web search returning titles, URLs, and content snippets. Use for facts, news, current info, lookups. ALWAYS try this first.
- tavily_research: deep multi-source synthesis for broad or complex questions. Slower; rate-limited (20/min). Escalate from tavily_search only when a single search is insufficient.
- tavily_extract: read FULL content of specific URLs you ALREADY have. Takes a urls[] array - NOT a search query.
- tavily_crawl: bulk-extract many pages from one website (configurable depth/breadth). Heavier than tavily_extract.
- tavily_map: list a website's URLs (site structure) to target crawl/extract.

HOW TOOLS COMBINE
- Find then read: tavily_search to discover a source, then tavily_extract to read it in full.
- Survey then mine: tavily_map to list a site's URLs, then tavily_crawl to pull them all.

RETURN FORMAT (important)
Every Tavily tool returns ONE markdown TEXT STRING. The whole result is plain text (titles, URLs, content). It is NOT a JSON object: there is no .results array, no .answer, and no .data property. Treat the return value itself as the text; do not index properties on it.

${IS_KEYLESS
  ? `Running in KEYLESS mode (no TAVILY_API_KEY set): tavily_search and tavily_extract are available now. tavily_crawl, tavily_map, and tavily_research require the TAVILY_API_KEY environment variable and will return an 'API key required' message if called.`
  : `tavily_search and tavily_extract also work in keyless mode; tavily_crawl, tavily_map, and tavily_research require the TAVILY_API_KEY environment variable (currently set). If a result says 'API key required', the key env var is missing.`}`,
      }
    );

    this.axiosInstance = axios.create({
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        ...(IS_KEYLESS
          ? { 'X-Tavily-Access-Mode': 'keyless', 'X-Client-Source': 'tavily-mcp-keyless' }
          : { 'Authorization': `Bearer ${API_KEY}`, 'X-Client-Source': 'MCP' }),
        'X-Session-Id': SESSION_ID,
        ...(HUMAN_ID ? { 'X-Human-Id': HUMAN_ID } : {}),
      }
    });

    if (IS_KEYLESS) {
      console.error('[tavily-mcp] no TAVILY_API_KEY set; running in keyless mode. Search and extract are available; other tools will return a message explaining that an API key is required.');
    }

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
          description: "Search the web for current information on any topic - the DEFAULT tool for facts, news, and lookups (start here). Returns a single markdown text string of titles, URLs, and snippets; the return value is plain text, NOT a JSON object (no .results or .answer array).",
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
                description: "Boost search results from a specific country. Must be a full country name (e.g., 'United States', 'Japan', 'Germany'). ISO country codes (e.g., 'us', 'jp') are not supported. Available only if topic is general. See https://docs.tavily.com/documentation/api-reference/search for the full list of supported countries.",
                default: ""
              },
              include_favicon: {
                type: "boolean",
                description: "Whether to include the favicon URL for each result",
                default: false
              },
              exact_match: {
                type: "boolean",
                description: "Only return results containing the exact phrase(s) in quotes in your query"
              }
            },
            required: ["query"]
          }
        },
        {
          name: "tavily_extract",
          description: "Extract the FULL content of specific URLs you already have. Takes a urls[] array - NOT a search query; use tavily_search first to find URLs. Returns a single markdown/text string (not a JSON object).",
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
          description: describeTool("Crawl a website from a base URL, bulk-extracting content from many pages with configurable depth and breadth. Heavier than tavily_extract. Returns markdown text.", true),
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
          description: describeTool("Map a website's structure: returns the URLs found starting from a base URL. Use to discover targets for tavily_crawl or tavily_extract. Returns markdown text.", true),
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
          description: describeTool("Perform deep multi-source research on a topic, synthesizing across many sources. Escalate here from tavily_search only for broad or complex questions one search cannot answer. Rate-limited (20 requests/min). Returns a markdown text string.", true),
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
      ];
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
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
              end_date: args.end_date,
              exact_match: args.exact_match
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
          if (isKeylessEnvelope(error.response?.data)) {
            return {
              content: [{
                type: "text",
                text: formatKeylessEnvelope(error.response!.data)
              }]
            };
          }
          const toolName = request.params.name?.replace('tavily_', '') || '';
          const docsUrl = this.docsURLs[toolName] || '';
          const responseData = error.response?.data;
          const detail = responseData && typeof responseData === 'object'
            ? (responseData.detail || responseData.message || responseData)
            : (error.message);
          const detailStr = typeof detail === 'object' ? JSON.stringify(detail) : String(detail);
          const docsSuffix = docsUrl ? `\nDocumentation: ${docsUrl}` : '';
          return {
            content: [{
              type: "text",
              text: `Tavily API error: ${detailStr}${docsSuffix}`
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
        exact_match: params.exact_match,
        ...(IS_KEYLESS ? {} : { api_key: API_KEY }),
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
  }

  async extract(params: any): Promise<TavilyResponse> {
    const response = await this.axiosInstance.post(this.baseURLs.extract, {
      ...params,
      ...(IS_KEYLESS ? {} : { api_key: API_KEY })
    });
    return response.data;
  }

  async crawl(params: any): Promise<TavilyCrawlResponse> {
    const response = await this.axiosInstance.post(this.baseURLs.crawl, {
      ...params,
      ...(IS_KEYLESS ? {} : { api_key: API_KEY })
    });
    return response.data;
  }

  async map(params: any): Promise<TavilyMapResponse> {
    const response = await this.axiosInstance.post(this.baseURLs.map, {
      ...params,
      ...(IS_KEYLESS ? {} : { api_key: API_KEY })
    });
    return response.data;
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
        ...(IS_KEYLESS ? {} : { api_key: API_KEY })
      });

      const requestId = response.data.request_id;
      if (!requestId) {
        return { error: `No request_id returned from research endpoint. Documentation: ${this.docsURLs.research}` };
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
            return { error: `Research task failed. Documentation: ${this.docsURLs.research}` };
          }

        } catch (pollError: any) {
          if (pollError.response?.status === 404) {
            return { error: 'Research task not found' };
          }
          throw pollError;
        }

        pollInterval = Math.min(pollInterval * POLL_BACKOFF_FACTOR, MAX_POLL_INTERVAL);
      }

      return { error: `Research task timed out. Documentation: ${this.docsURLs.research}` };
    } catch (error: any) {
      // If the API signals that this request must use streaming, fall back to
      // stream=true transparently and assemble the report in memory — the tool
      // result is identical to the polling flow.
      if (error.response?.status === 400 &&
          error.response?.data?.detail?.error_code === 'research_stream_required') {
        return this.researchViaStream(params);
      }
      if (error.response?.status === 401) {
        throw new Error(`Invalid API key. Documentation: ${this.docsURLs.research}`);
      } else if (error.response?.status === 429) {
        throw new Error(`Usage limit exceeded. Documentation: ${this.docsURLs.research}`);
      }
      throw error;
    }
  }

  private async researchViaStream(params: any): Promise<TavilyResearchResponse> {
    const HEADERS_TIMEOUT_MS = 30000;      // time budget for the response to start
    const STREAM_IDLE_TIMEOUT_MS = 300000; // 5 min: tolerate the silent report-generation phase (the report is generated then flushed at once, so no bytes flow meanwhile)
    const maxStreamDuration = params.model === 'mini' ? 300000 : 900000;

    const controller = new AbortController();
    const headerTimer = setTimeout(() => controller.abort(), HEADERS_TIMEOUT_MS);
    let response;
    try {
      response = await this.axiosInstance.post(
        this.baseURLs.research,
        {
          input: params.input,
          model: params.model || 'auto',
          api_key: API_KEY,
          stream: true
        },
        {
          responseType: 'stream',
          signal: controller.signal,
          timeout: 0, // lifetime is enforced by the timers below, not by axios
          validateStatus: () => true
        }
      );
    } catch (error: any) {
      const reason = controller.signal.aborted
        ? `no response after ${HEADERS_TIMEOUT_MS / 1000}s`
        : error.message;
      return { error: `Research stream request failed: ${reason}. Documentation: ${this.docsURLs.research}` };
    } finally {
      clearTimeout(headerTimer);
    }

    const stream = response.data;

    if (response.status !== 200) {
      const body = await this.readStreamBounded(stream, 16384);
      let detail = body;
      try {
        const parsed = JSON.parse(body);
        detail = JSON.stringify(parsed.detail ?? parsed);
      } catch { /* keep raw body */ }
      return { error: `Research stream request failed (HTTP ${response.status}): ${detail}. Documentation: ${this.docsURLs.research}` };
    }

    return new Promise<TavilyResearchResponse>((resolve) => {
      let content = '';
      let buffer = '';
      let settled = false;
      let idleTimer: NodeJS.Timeout | undefined;

      const settle = (result: TavilyResearchResponse) => {
        if (settled) return;
        settled = true;
        clearTimeout(idleTimer);
        clearTimeout(overallTimer);
        // Tear the connection down immediately — never leave it open once the
        // outcome is known.
        stream.destroy();
        resolve(result);
      };

      const overallTimer = setTimeout(() => {
        settle({ error: `Research stream timed out after ${maxStreamDuration / 1000}s. Documentation: ${this.docsURLs.research}` });
      }, maxStreamDuration);

      const resetIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          settle({ error: `Research stream received no data for ${STREAM_IDLE_TIMEOUT_MS / 1000}s; connection closed. Documentation: ${this.docsURLs.research}` });
        }, STREAM_IDLE_TIMEOUT_MS);
      };
      resetIdleTimer();

      const handleFrame = (frame: string) => {
        let eventType = 'message';
        const dataLines: string[] = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) eventType = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        const data = dataLines.join('\n');

        if (eventType === 'error') {
          let message: any = data;
          try { message = JSON.parse(data).error ?? data; } catch { /* keep raw data */ }
          if (typeof message === 'object') message = JSON.stringify(message);
          settle({ error: `Research stream error: ${message}. Documentation: ${this.docsURLs.research}` });
          return;
        }
        if (eventType === 'done') {
          settle(content
            ? { content }
            : { error: `Research stream completed without content. Documentation: ${this.docsURLs.research}` });
          return;
        }
        if (!data) return;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta;
          if (typeof delta?.content === 'string') content += delta.content;
        } catch { /* tolerate malformed frames; completion integrity is guarded by the done event */ }
      };

      stream.on('data', (chunk: Buffer) => {
        if (settled) return;
        resetIdleTimer();
        buffer += chunk.toString('utf-8');
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          if (settled) break;
          if (frame.trim()) handleFrame(frame);
        }
      });
      stream.on('error', (err: Error) => {
        settle({ error: `Research stream connection error: ${err.message}. Documentation: ${this.docsURLs.research}` });
      });
      // 'end'/'close' without a done event means the connection dropped before
      // completion — a partial report is worse than an explicit error.
      stream.on('end', () => {
        // The server ends the stream right after `event: done` without a
        // trailing blank line, so the final frame may still be buffered —
        // flush it before judging the outcome.
        if (!settled && buffer.trim()) handleFrame(buffer.trim());
        settle({ error: `Research stream ended before completion. Documentation: ${this.docsURLs.research}` });
      });
      stream.on('close', () => {
        settle({ error: `Research stream closed before completion. Documentation: ${this.docsURLs.research}` });
      });
    });
  }

  /** Read at most maxBytes from a stream as text, then destroy it. */
  private readStreamBounded(stream: any, maxBytes: number): Promise<string> {
    return new Promise((resolve) => {
      let data = '';
      const timer = setTimeout(() => { stream.destroy(); resolve(data); }, 10000);
      const finish = () => { clearTimeout(timer); resolve(data); };
      stream.on('data', (chunk: Buffer) => {
        data += chunk.toString('utf-8');
        if (data.length >= maxBytes) stream.destroy();
      });
      stream.on('end', finish);
      stream.on('close', finish);
      stream.on('error', finish);
    });
  }
}

function isKeylessEnvelope(data: any): boolean {
  // Recognises the Tavily API's recoverable-error envelope shape.
  // Used for keyless rate-limit caps and endpoints that require an API key.
  return !!(data && typeof data === 'object'
    && data.error && typeof data.error === 'object'
    && typeof data.error.code === 'string');
}

function formatKeylessEnvelope(data: any): string {
  // Render the Tavily API's recoverable-error envelope as plain text:
  // the natural-language message, followed by retry-after (when present).
  const err = data.error;
  const lines: string[] = [String(err.message ?? '')];
  if (err.retry_after_seconds != null) {
    lines.push(`Retry after: ${err.retry_after_seconds}s`);
  }
  if (Array.isArray(err.next_actions) && err.next_actions.length > 0) {
    lines.push('', 'Continuation options:');
    for (const a of err.next_actions) {
      if (a?.type === 'agentic_payment') {
        lines.push(`- Agentic payment (${a.scheme ?? 'x402'}): ${a.details ?? ''}`);
      } else if (a?.type === 'signup') {
        lines.push(`- Sign up for a Tavily API key: ${a.url ?? ''}`);
      } else if (a?.type === 'bonus_credits' && a.eligible) {
        lines.push(`- Earn ${a.credits_on_completion ?? ''} bonus credits by POSTing answers to ${a.endpoint ?? ''}`);
        if (Array.isArray(a.questions)) {
          a.questions.forEach((q: string, i: number) => lines.push(`    ${i + 1}. ${q}`));
        }
      }
    }
  }
  return lines.filter(Boolean).join('\n');
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
    if (result.id) {
      output.push(`ID: ${result.id}`);
    }
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

function listTools(): void {
  const tools = [
    {
      name: "tavily_search",
      description: "Search the web for current information on any topic - the DEFAULT tool for facts, news, and lookups (start here). Returns a single markdown text string of titles, URLs, and snippets; the return value is plain text, NOT a JSON object (no .results or .answer array)."
    },
    {
      name: "tavily_extract",
      description: "Extract the FULL content of specific URLs you already have. Takes a urls[] array - NOT a search query; use tavily_search first to find URLs. Returns a single markdown/text string (not a JSON object)."
    },
    {
      name: "tavily_crawl",
      description: describeTool("Crawl a website from a base URL, bulk-extracting content from many pages with configurable depth and breadth. Heavier than tavily_extract. Returns markdown text.", true)
    },
    {
      name: "tavily_map",
      description: describeTool("Map a website's structure: returns the URLs found starting from a base URL. Use to discover targets for tavily_crawl or tavily_extract. Returns markdown text.", true)
    },
    {
      name: "tavily_research",
      description: describeTool("Perform deep multi-source research on a topic, synthesizing across many sources. Escalate here from tavily_search only for broad or complex questions one search cannot answer. Rate-limited (20 requests/min). Returns a markdown text string.", true)
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