import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { TavilyClientCore } from "../core/tavily-client.js";
import { formatResults, formatCrawlResults, formatMapResults } from "../utils/formatters.js";

export interface McpServerOptions {
  apiKey: string;
}

export class TavilyMcpServer {
  private server: Server;
  private tavilyClient: TavilyClientCore;
  private apiKey: string;

  constructor(options: McpServerOptions) {
    this.apiKey = options.apiKey;
    this.tavilyClient = new TavilyClientCore();
    
    this.server = new Server(
      {
        name: "tavily-mcp",
        version: "0.3.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: this.tavilyClient.getTools() };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const args = request.params.arguments ?? {};

        switch (request.params.name) {
          case "tavily-search":
            // If country is set, ensure topic is general
            if (args.country) {
              args.topic = "general";
            }
            
            const searchResponse = await this.tavilyClient.search({
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
            }, this.apiKey);

            return {
              content: [{
                type: "text",
                text: formatResults(searchResponse)
              }]
            };
          
          case "tavily-extract":
            const extractResponse = await this.tavilyClient.extract({
              urls: args.urls,
              extract_depth: args.extract_depth,
              include_images: args.include_images,
              format: args.format,
              include_favicon: args.include_favicon
            }, this.apiKey);

            return {
              content: [{
                type: "text",
                text: formatResults(extractResponse)
              }]
            };

          case "tavily-crawl":
            const crawlResponse = await this.tavilyClient.crawl({
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
            }, this.apiKey);

            return {
              content: [{
                type: "text",
                text: formatCrawlResults(crawlResponse)
              }]
            };

          case "tavily-map":
            const mapResponse = await this.tavilyClient.map({
              url: args.url,
              max_depth: args.max_depth,
              max_breadth: args.max_breadth,
              limit: args.limit,
              instructions: args.instructions,
              select_paths: Array.isArray(args.select_paths) ? args.select_paths : [],
              select_domains: Array.isArray(args.select_domains) ? args.select_domains : [],
              allow_external: args.allow_external,
              categories: Array.isArray(args.categories) ? args.categories : []
            }, this.apiKey);

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
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Tavily API error: ${error.message}`
          }],
          isError: true,
        };
      }
    });
  }

  getServer(): Server {
    return this.server;
  }
}
