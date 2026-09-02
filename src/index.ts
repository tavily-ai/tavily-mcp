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

interface TavilyFeedbackResponse {
  success?: boolean;
  feedback_id?: string;
  response_time?: number;
  error?: string;
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
    research: 'https://api.tavily.com/research',
    feedback: 'https://api.tavily.com/feedback'
  };

  private docsURLs: Record<string, string> = {
    search: 'https://docs.tavily.com/documentation/api-reference/endpoint/search',
    extract: 'https://docs.tavily.com/documentation/api-reference/endpoint/extract',
    crawl: 'https://docs.tavily.com/documentation/api-reference/endpoint/crawl',
    map: 'https://docs.tavily.com/documentation/api-reference/endpoint/map',
    research: 'https://docs.tavily.com/documentation/api-reference/endpoint/research',
    feedback: 'https://docs.tavily.com/documentation/api-reference/endpoint/feedback',
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
          description: "Perform comprehensive research on a given topic or question. Use this tool when you need to gather information from multiple sources to answer a question or complete a task. Returns a detailed response based on the research findings. Rate limit: 20 requests per minute.",
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
        {
          name: "tavily_feedback",
          description: "Submit feedback for a search request or session via POST /feedback. Maximize useful signal whenever you call this tool:\n1) Scope: set request_id from the search response (and/or session_id).\n2) Per-result urls_scores first — MANDATORY when scoring a search: include an entry for EVERY result in the search response, HELPFUL and WEAK/IRRELEVANT/HARMFUL alike, by id (1 perfect … 0 irrelevant … -1 harmful). Vary scores honestly; do not reuse one default value. Never submit an agent_score with empty urls_scores.\n3) Overall agent_score: derive from those urls_scores (and whether you could answer well). Never default to 0.7. Also set response_delivered.\n4) Provenance: set used_ids for every result you relied on; add used_citations for key snippets when available.\n5) Explain failures: any score < 0.5 needs comment (overall and/or per-result).\n6) Optional depth: extra_scores (e.g. freshness, authority, relevance), human_score, top-level comment.\nPrefer specific, actionable feedback over a sparse payload.",
          inputSchema: {
            type: "object",
            properties: {
              session_id: {
                type: "string",
                description: "The session to give feedback on. Optional if request_id is provided."
              },
              request_id: {
                type: "string",
                description: "The search request to give feedback on. If provided, feedback applies to this request; otherwise to the whole session."
              },
              agent_score: {
                type: ["number", "string"],
                description: "Overall score for how relevant and useful the search results were for your task. Set this AFTER urls_scores: derive it from those per-result scores (e.g. reflect the best used results, how much weak/irrelevant noise hurt, and whether you could answer well). Do not pick a default like 0.7. Scale: 1 perfect, 0 irrelevant, -1 harmful/misleading; use the full range in between. NEVER set agent_score without also setting urls_scores — an overall score must be backed by a per-result score for every result you evaluated, good and bad alike. If the numeric score is below 0.5 (including 0 and -1), you MUST also set comment explaining what was wrong."
              },
              human_score: {
                type: ["number", "string"],
                description: "Feedback from the end user, if available (e.g. like/dislike)."
              },
              extra_scores: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "Score label (e.g. freshness, authority, relevance)" },
                    value: { type: ["number", "string"], description: "Score value on any scale" }
                  },
                  required: ["label", "value"]
                },
                description: "Additional labeled scores (e.g. freshness, authority, relevance). Any scale."
              },
              comment: {
                type: "string",
                description: "Free-text explanation of the feedback. Required when agent_score is below 0.5 — explain overall what went wrong with the results."
              },
              response_delivered: {
                type: "string",
                description: "The final answer you produced using the search results. Include this whenever you submit feedback after answering."
              },
              used_urls: {
                type: "array",
                items: { type: "string" },
                description: "URLs of the results you actually used in your answer. Alternative to used_ids."
              },
              used_ids: {
                type: "array",
                items: { type: "string" },
                description: "IDs of the results you actually used in your answer, as returned on each result in the search response. Alternative to used_urls."
              },
              used_citations: {
                type: "array",
                items: { type: "string" },
                description: "Specific content snippets you used from the results. Prefer short verbatim quotes that support your answer."
              },
              urls_scores: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      description: "Identifier of the result, as returned on each result in the search response. Alternative to url; unambiguous when the same URL appears more than once."
                    },
                    url: {
                      type: "string",
                      description: "Result URL. Alternative to id."
                    },
                    agent_score: {
                      type: ["number", "string"],
                      description: "Honest score for this single result on how much it helped or hurt your task. Scale: 1 perfect, 0 irrelevant, -1 harmful/misleading; use the full range (e.g. 0.2 weak, 0.5 mixed, 0.9 strong). Score each result independently — do not default every URL to the same value. If the numeric score is below 0.5 (including 0 and -1), you MUST also set comment on this urls_scores item explaining why the result was bad."
                    },
                    scores: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          label: { type: "string", description: "Score label (e.g. freshness, authority, relevance)" },
                          value: { type: ["number", "string"], description: "Score value on any scale" }
                        },
                        required: ["label", "value"]
                      },
                      description: "Additional labeled scores for this result (e.g. authority, freshness, relevance)."
                    },
                    comment: {
                      type: "string",
                      description: "Free-text explanation for this result. Required when agent_score is below 0.5 — describe why the result was irrelevant, incomplete, outdated, or harmful."
                    }
                  }
                },
                description: "Per-result feedback — REQUIRED whenever you set agent_score for a search request. Score EVERY result from the search response, helpful AND weak/irrelevant/harmful, identifying each by id (preferred) or url, so the spread is clear. The overall agent_score must follow from these; never set an overall score without the per-result scores backing it. Low scores (< 0.5) require a comment."
              }
            },
            anyOf: [
              { required: ["session_id"] },
              { required: ["request_id"] }
            ]
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

          case "tavily_feedback":
            const feedbackResponse = await this.feedback({
              session_id: args.session_id,
              request_id: args.request_id,
              agent_score: args.agent_score,
              human_score: args.human_score,
              extra_scores: args.extra_scores,
              comment: args.comment,
              response_delivered: args.response_delivered,
              used_urls: args.used_urls,
              used_ids: args.used_ids,
              used_citations: args.used_citations,
              urls_scores: args.urls_scores,
            });
            return {
              content: [{
                type: "text",
                text: formatFeedbackResult(feedbackResponse)
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
      
      const cleanedParams = stripEmptyValues(searchParams);

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

  async feedback(params: any): Promise<TavilyFeedbackResponse> {
    const response = await this.axiosInstance.post(this.baseURLs.feedback, {
      ...stripEmptyValues(params),
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

function stripEmptyValues(params: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const key in params) {
    const value = params[key];
    // Skip empty strings, null, undefined, and empty arrays
    if (value !== "" && value !== null && value !== undefined &&
        !(Array.isArray(value) && value.length === 0)) {
      cleaned[key] = value;
    }
  }
  return cleaned;
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

function formatFeedbackResult(response: TavilyFeedbackResponse): string {
  if (response.error) {
    return `Feedback Error: ${response.error}`;
  }
  const parts = [`Feedback submitted (feedback_id: ${response.feedback_id ?? 'unknown'})`];
  if (response.response_time != null) {
    parts.push(`response_time: ${response.response_time}s`);
  }
  return parts.join(', ');
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
    },
    {
      name: "tavily_feedback",
      description: "Submits structured feedback (agent_score, per-result urls_scores, used_ids/citations, comments) on a search request or session via POST /feedback. Score every result honestly and explain any score below 0.5."
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