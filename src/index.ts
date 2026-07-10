#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {CallToolRequestSchema, ListToolsRequestSchema, Tool} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosError } from "axios";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { KeyManager, sanitizeKey } from "./keyManager.js";

dotenv.config();

// 判断是否为 keyless 模式：既没有 TAVILY_API_KEY 也没有多 key 配置
const HAS_ANY_KEY = !!(
  process.env.TAVILY_API_KEY ||
  process.env.TAVILY_API_KEYS ||
  Object.keys(process.env).some((k) => k.startsWith("TAVILY_API_KEY_"))
);
const IS_KEYLESS = !HAS_ANY_KEY;
const HUMAN_ID = process.env.TAVILY_HUMAN_ID;
const SESSION_ID = randomUUID();

// 全局 KeyManager 实例（在 TavilyClient 初始化时创建）
let keyManager: KeyManager | null = null;


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

  private docsURLs: Record<string, string> = {
    search: 'https://docs.tavily.com/documentation/api-reference/endpoint/search',
    extract: 'https://docs.tavily.com/documentation/api-reference/endpoint/extract',
    crawl: 'https://docs.tavily.com/documentation/api-reference/endpoint/crawl',
    map: 'https://docs.tavily.com/documentation/api-reference/endpoint/map',
    research: 'https://docs.tavily.com/documentation/api-reference/endpoint/research',
  };

  constructor(km: KeyManager | null) {
    keyManager = km;

    this.server = new Server(
      {
        name: "tavily-mcp",
        version: "0.2.20",
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
          : { 'X-Client-Source': 'MCP' }),
        'X-Session-Id': SESSION_ID,
        ...(HUMAN_ID ? { 'X-Human-Id': HUMAN_ID } : {}),
      }
    });

    if (IS_KEYLESS) {
      console.error('[tavily-mcp] no TAVILY_API_KEY set; running in keyless mode. Search and extract are available; other tools will return a message explaining that an API key is required.');
    } else {
      console.error(`[tavily-mcp] 多 key 模式，管理 ${km!.getTotalKeyCount()} 个 key`);
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

  /**
   * 带 key 选择与故障切换的请求包装方法
   * - 每次请求从 KeyManager 选择最佳 key
   * - 遇到 432/433/401/429 自动切换 key 重试
   * - 钥匙数量决定了最大重试次数
   * @returns { data, usedKey } — data 为响应体，usedKey 为实际使用的 key（keyless 模式为 null）
   */
  private async makeAuthenticatedRequest(
    method: 'post' | 'get',
    url: string,
    data?: any
  ): Promise<{ data: any; usedKey: string | null }> {
    if (IS_KEYLESS || !keyManager) {
      // keyless 模式：直接请求，不带鉴权
      const response = method === 'post'
        ? await this.axiosInstance.post(url, data)
        : await this.axiosInstance.get(url);
      return { data: response.data, usedKey: null };
    }

    const maxRetries = keyManager.getTotalKeyCount();
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const selectedKey = keyManager.selectKey();
      if (!selectedKey) {
        // 生成有诊断价值的错误信息
        const totalKeys = keyManager.getTotalKeyCount();
        const statusSummary = keyManager.getKeyStatusSummary();
        const waitHint = keyManager.getMinCooldownRemainingMinutes();
        throw new Error(
          `[tavily-mcp] 所有 ${totalKeys} 个 key 均不可用` +
          `（${statusSummary}）` +
          (waitHint > 0 ? `，预计 ${waitHint} 分钟后有 key 冷却到期，或请检查 key 配置` : '，请检查 key 配置')
        );
      }

      const config: any = {
        headers: {
          'Authorization': `Bearer ${selectedKey}`,
        },
      };

      // 在请求体中注入 api_key（与 Authorization header 双重保障；
      // Tavily API 支持两种鉴权方式，Authorization 是标准做法，body api_key 作为兼容保留）
      const requestData = data ? { ...data, api_key: selectedKey } : { api_key: selectedKey };

      try {
        const response = method === 'post'
          ? await this.axiosInstance.post(url, requestData, config)
          : await this.axiosInstance.get(url, config);
        return { data: response.data, usedKey: selectedKey };
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status === 432 || status === 433 || status === 401 || status === 429) {
            // 429 时读取 retry-after 响应头，精确设置冷却时间
            let retryAfterSec: number | undefined;
            if (status === 429) {
              const retryAfterHeader = error.response?.headers?.['retry-after'];
              if (retryAfterHeader) {
                retryAfterSec = parseInt(retryAfterHeader, 10);
                if (isNaN(retryAfterSec)) retryAfterSec = undefined;
              }
            }
            const canRetry = keyManager.handleError(selectedKey, status, retryAfterSec);
            if (canRetry && attempt < maxRetries - 1) {
              console.error(
                `[tavily-mcp] key ${sanitizeKey(selectedKey)} 异常 ` +
                `(status=${status}${retryAfterSec ? `, retry-after=${retryAfterSec}s` : ''})，` +
                `自动切换重试 (${attempt + 1}/${maxRetries - 1})`
              );
              continue;
            }
          }
        }
        // 不可重试的错误，或所有 key 已耗尽
        lastError = error;
        break;
      }
    }

    throw lastError || new Error('[tavily-mcp] 请求失败：未知错误');
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
    if (keyManager && !IS_KEYLESS) {
      await keyManager.initialize();
    }
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
      
      // keyless 模式下 api_key 字段不需要（在 makeAuthenticatedRequest 中自动添加）
      // 但为了兼容 keyless 的 request body，保持不添加
      return (await this.makeAuthenticatedRequest('post', endpoint, cleanedParams)).data;
  }

  async extract(params: any): Promise<TavilyResponse> {
    return (await this.makeAuthenticatedRequest('post', this.baseURLs.extract, params)).data;
  }

  async crawl(params: any): Promise<TavilyCrawlResponse> {
    const { data } = await this.makeAuthenticatedRequest('post', this.baseURLs.crawl, params);
    return data;
  }

  async map(params: any): Promise<TavilyMapResponse> {
    const { data } = await this.makeAuthenticatedRequest('post', this.baseURLs.map, params);
    return data;
  }

  async research(params: any): Promise<TavilyResearchResponse> {
    const INITIAL_POLL_INTERVAL = 2000; // 2 seconds in ms
    const MAX_POLL_INTERVAL = 10000; // 10 seconds in ms
    const POLL_BACKOFF_FACTOR = 1.5;
    const MAX_PRO_MODEL_POLL_DURATION = 900000; // 15 minutes in ms
    const MAX_MINI_MODEL_POLL_DURATION = 300000; // 5 minutes in ms

    try {
      // 使用 makeAuthenticatedRequest 发起初始 research 请求（自动处理 key 选择和重试）
      const { data: response, usedKey } = await this.makeAuthenticatedRequest('post', this.baseURLs.research, {
        input: params.input,
        model: params.model || 'auto',
      });

      const requestId = response.request_id;
      if (!requestId) {
        return { error: `No request_id returned from research endpoint. Documentation: ${this.docsURLs.research}` };
      }

      // 轮询固定使用初始请求的 key，避免查询别 key 创建的任务导致 404
      const pollingConfig: any = usedKey
        ? { headers: { 'Authorization': `Bearer ${usedKey}` } }
        : {};

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
            `${this.baseURLs.research}/${requestId}`,
            pollingConfig
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
      if (error.response?.status === 401) {
        throw new Error(`Invalid API key. Documentation: ${this.docsURLs.research}`);
      } else if (error.response?.status === 429) {
        throw new Error(`Usage limit exceeded. Documentation: ${this.docsURLs.research}`);
      }
      throw error;
    }
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
const km = IS_KEYLESS ? null : new KeyManager();
const server = new TavilyClient(km);
server.run().catch(console.error);