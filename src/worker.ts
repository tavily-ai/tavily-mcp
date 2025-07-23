import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "../worker-configuration.js";
import { TavilyClientCore } from "./core/tavily-client.js";
import { formatResults, formatCrawlResults, formatMapResults } from "./utils/formatters.js";

export class TavilyMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "Tavily MCP Server",
    version: "0.3.0",
  });

  private tavilyClient = new TavilyClientCore();

  async init() {
    // Tavily Search tool
    this.server.tool(
      "tavily-search",
      {
        query: z.string().describe("Search query"),
        search_depth: z.enum(["basic", "advanced"]).default("basic").describe("The depth of the search"),
        topic: z.enum(["general", "news"]).default("general").describe("The category of the search"),
        days: z.number().default(3).describe("Number of days back for news search"),
        time_range: z.enum(["day", "week", "month", "year", "d", "w", "m", "y"]).optional().describe("Time range for search results"),
        start_date: z.string().default("").describe("Start date in YYYY-MM-DD format"),
        end_date: z.string().default("").describe("End date in YYYY-MM-DD format"),
        max_results: z.number().min(5).max(20).default(10).describe("Maximum number of search results"),
        include_images: z.boolean().default(false).describe("Include query-related images"),
        include_image_descriptions: z.boolean().default(false).describe("Include image descriptions"),
        include_raw_content: z.boolean().default(false).describe("Include cleaned HTML content"),
        include_domains: z.array(z.string()).default([]).describe("Domains to include"),
        exclude_domains: z.array(z.string()).default([]).describe("Domains to exclude"),
        country: z.string().default("").describe("Country to boost results from"),
        include_favicon: z.boolean().default(false).describe("Include favicon URLs")
      },
      async (params: any, extra: any) => {
        const response = await this.tavilyClient.search(params, extra.env.TAVILY_API_KEY);
        return {
          content: [{ type: "text", text: formatResults(response) }]
        };
      }
    );

    // Tavily Extract tool
    this.server.tool(
      "tavily-extract",
      {
        urls: z.array(z.string()).describe("URLs to extract content from"),
        extract_depth: z.enum(["basic", "advanced"]).default("basic").describe("Depth of extraction"),
        include_images: z.boolean().default(false).describe("Include extracted images"),
        format: z.enum(["markdown", "text"]).default("markdown").describe("Format of extracted content"),
        include_favicon: z.boolean().default(false).describe("Include favicon URLs")
      },
      async (params: any, extra: any) => {
        const response = await this.tavilyClient.extract(params, extra.env.TAVILY_API_KEY);
        return {
          content: [{ type: "text", text: formatResults(response) }]
        };
      }
    );

    // Tavily Crawl tool
    this.server.tool(
      "tavily-crawl",
      {
        url: z.string().describe("Root URL to begin crawl"),
        max_depth: z.number().min(1).default(1).describe("Maximum crawl depth"),
        max_breadth: z.number().min(1).default(20).describe("Maximum links per page"),
        limit: z.number().min(1).default(50).describe("Total links to process"),
        instructions: z.string().optional().describe("Natural language instructions"),
        select_paths: z.array(z.string()).default([]).describe("Regex patterns for path selection"),
        select_domains: z.array(z.string()).default([]).describe("Regex patterns for domain selection"),
        allow_external: z.boolean().default(false).describe("Allow external domain links"),
        categories: z.array(z.enum(["Careers", "Blog", "Documentation", "About", "Pricing", "Community", "Developers", "Contact", "Media"])).default([]).describe("Category filters"),
        extract_depth: z.enum(["basic", "advanced"]).default("basic").describe("Extraction depth"),
        format: z.enum(["markdown", "text"]).default("markdown").describe("Content format"),
        include_favicon: z.boolean().default(false).describe("Include favicon URLs")
      },
      async (params: any, extra: any) => {
        const response = await this.tavilyClient.crawl(params, extra.env.TAVILY_API_KEY);
        return {
          content: [{ type: "text", text: formatCrawlResults(response) }]
        };
      }
    );

    // Tavily Map tool
    this.server.tool(
      "tavily-map",
      {
        url: z.string().describe("Root URL to begin mapping"),
        max_depth: z.number().min(1).default(1).describe("Maximum mapping depth"),
        max_breadth: z.number().min(1).default(20).describe("Maximum links per page"),
        limit: z.number().min(1).default(50).describe("Total links to process"),
        instructions: z.string().optional().describe("Natural language instructions"),
        select_paths: z.array(z.string()).default([]).describe("Regex patterns for path selection"),
        select_domains: z.array(z.string()).default([]).describe("Regex patterns for domain selection"),
        allow_external: z.boolean().default(false).describe("Allow external domain links"),
        categories: z.array(z.enum(["Careers", "Blog", "Documentation", "About", "Pricing", "Community", "Developers", "Contact", "Media"])).default([]).describe("Category filters")
      },
      async (params: any, extra: any) => {
        const response = await this.tavilyClient.map(params, extra.env.TAVILY_API_KEY);
        return {
          content: [{ type: "text", text: formatMapResults(response) }]
        };
      }
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: any) {
    const url = new URL(request.url);

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return TavilyMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    if (url.pathname === "/mcp") {
      return TavilyMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("Tavily MCP Server - Not found", { status: 404 });
  },
};