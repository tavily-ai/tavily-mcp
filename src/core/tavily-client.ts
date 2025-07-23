// Core Tavily client that works in both Node.js and Cloudflare Workers
import { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface TavilyResponse {
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

export interface TavilyCrawlResponse {
  base_url: string;
  results: Array<{
    url: string;
    raw_content: string;
    favicon?: string;
  }>;
  response_time: number;
}

export interface TavilyMapResponse {
  base_url: string;
  results: string[];
  response_time: number;
}

export class TavilyClientCore {
  private baseURLs = {
    search: 'https://api.tavily.com/search',
    extract: 'https://api.tavily.com/extract',
    crawl: 'https://api.tavily.com/crawl',
    map: 'https://api.tavily.com/map'
  };

  async search(params: any, apiKey: string): Promise<TavilyResponse> {
    return this.makeApiCall(this.baseURLs.search, params, apiKey);
  }

  async extract(params: any, apiKey: string): Promise<TavilyResponse> {
    return this.makeApiCall(this.baseURLs.extract, params, apiKey);
  }

  async crawl(params: any, apiKey: string): Promise<TavilyCrawlResponse> {
    return this.makeApiCall(this.baseURLs.crawl, params, apiKey);
  }

  async map(params: any, apiKey: string): Promise<TavilyMapResponse> {
    return this.makeApiCall(this.baseURLs.map, params, apiKey);
  }

  private async makeApiCall(endpoint: string, params: any, apiKey: string): Promise<any> {
    if (!apiKey) {
      throw new Error("TAVILY_API_KEY is required");
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Client-Source': 'MCP'
      },
      body: JSON.stringify({
        ...params,
        api_key: apiKey
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key');
      } else if (response.status === 429) {
        throw new Error('Usage limit exceeded');
      }
      throw new Error(`API request failed: ${response.statusText}`);
    }

    return response.json();
  }

  getTools(): Tool[] {
    return [
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
  }
}
