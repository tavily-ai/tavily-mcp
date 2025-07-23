import { z } from "zod";

export const searchToolSchema = z.object({
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
});

export const extractToolSchema = z.object({
  urls: z.array(z.string()).describe("URLs to extract content from"),
  extract_depth: z.enum(["basic", "advanced"]).default("basic").describe("Depth of extraction"),
  include_images: z.boolean().default(false).describe("Include extracted images"),
  format: z.enum(["markdown", "text"]).default("markdown").describe("Format of extracted content"),
  include_favicon: z.boolean().default(false).describe("Include favicon URLs")
});

export const crawlToolSchema = z.object({
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
});

export const mapToolSchema = z.object({
  url: z.string().describe("Root URL to begin mapping"),
  max_depth: z.number().min(1).default(1).describe("Maximum mapping depth"),
  max_breadth: z.number().min(1).default(20).describe("Maximum links per page"),
  limit: z.number().min(1).default(50).describe("Total links to process"),
  instructions: z.string().optional().describe("Natural language instructions"),
  select_paths: z.array(z.string()).default([]).describe("Regex patterns for path selection"),
  select_domains: z.array(z.string()).default([]).describe("Regex patterns for domain selection"),
  allow_external: z.boolean().default(false).describe("Allow external domain links"),
  categories: z.array(z.enum(["Careers", "Blog", "Documentation", "About", "Pricing", "Community", "Developers", "Contact", "Media"])).default([]).describe("Category filters")
});
