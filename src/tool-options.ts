import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

const boolean = (description: string) => ({ type: 'boolean', description });
const strings = (description: string, maxItems?: number) => ({ type: 'array', items: { type: 'string' }, description, ...(maxItems ? { maxItems } : {}) });
const integer = (minimum: number, maximum: number, description: string) => ({ type: 'integer', minimum, maximum, description });
const usage = boolean('Include credit usage in the response.');
const exclusions = {
  exclude_paths: strings('Regex patterns for paths to exclude.'),
  exclude_domains: strings('Regex patterns for domains to exclude.'),
};

/** Public API options, shared by tools/list and tools/call validation. */
const options: Record<string, Record<string, object>> = {
  tavily_search: {
    topic: { type: 'string', enum: ['general', 'news', 'finance'], description: 'Search category; general is the default.' },
    max_results: { ...integer(0, 20, 'Maximum results. API default: 10.'), default: 10 },
    include_answer: { anyOf: [{ type: 'boolean' }, { type: 'string', enum: ['basic', 'advanced'] }], description: 'Include a generated answer.' },
    include_raw_content: { anyOf: [{ type: 'boolean' }, { type: 'string', enum: ['markdown', 'text'] }], description: 'Include cleaned page content.' },
    chunks_per_source: integer(1, 3, 'Relevant chunks per source; basic, advanced and fast only.'),
    include_domains_mode: { type: 'string', enum: ['restrict', 'prefer'], description: 'Restrict to or prefer include_domains; requires a nonempty list.' },
    language: { type: 'string', description: 'Preferred result language (API-supported ISO code).' },
    filter_by_language: boolean('Only return the selected language; requires language.'),
    safe_search: boolean('Filter unsafe results; unavailable with fast or ultra-fast.'),
    include_published_date: boolean('Include detected publication dates (beta).'),
    filter_by_published_date: boolean('Exclude results with no detected publication date.'),
    auto_parameters: boolean('Let Tavily select suitable parameters from the query.'),
    include_usage: usage,
    time_range: { type: 'string', enum: ['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y'] },
  },
  tavily_extract: {
    urls: { ...strings('URLs to extract.', 20), minItems: 1 },
    chunks_per_source: integer(1, 5, 'Chunks per source, used with query.'),
    timeout: { type: 'number', minimum: 1, maximum: 60, description: 'API extraction timeout in seconds.' },
    include_usage: usage,
  },
  tavily_crawl: {
    ...exclusions,
    chunks_per_source: integer(1, 5, 'Chunks per source, used with instructions.'),
    include_images: boolean('Include extracted images.'),
    timeout: { type: 'number', minimum: 10, maximum: 150, description: 'API crawl timeout in seconds.' },
    include_usage: usage,
    max_breadth: integer(1, 500, 'Maximum links per page; API default 20.'),
  },
  tavily_map: {
    ...exclusions,
    timeout: { type: 'number', minimum: 10, maximum: 150, description: 'API mapping timeout in seconds.' },
    include_usage: usage,
    max_breadth: integer(1, 500, 'Maximum links per page; API default 20.'),
  },
  tavily_research: {
    output_schema: { type: 'object', description: 'JSON Schema for structured research output.' },
    citation_format: { type: 'string', enum: ['numbered', 'mla', 'apa', 'chicago'] },
    include_domains: strings('Prefer these domains (soft preference).', 20),
    exclude_domains: strings('Exclude these domains.', 20),
    output_length: { type: 'string', enum: ['short', 'standard', 'long'] },
    files: { type: 'array', maxItems: 5, description: 'Up to five .txt/.md/.json attachments; 80,000 words combined. Contents must be base64.', items: {
      type: 'object', properties: { name: { type: 'string' }, data: { type: 'string' }, type: { type: 'string', enum: ['base64'] } }, required: ['name', 'data'], additionalProperties: false,
    } },
  },
};

export function extendTools(tools: Tool[]): Tool[] {
  return tools.map(tool => ({ ...tool, inputSchema: {
    ...tool.inputSchema,
    properties: { ...tool.inputSchema.properties, ...options[tool.name] },
    additionalProperties: false,
  } }));
}

const validator = new AjvJsonSchemaValidator();
export function validateArguments(tool: Tool, args: Record<string, any>): void {
  const result = validator.getValidator(tool.inputSchema)(args);
  if (!result.valid) throw new Error(`Invalid ${tool.name} arguments: ${result.errorMessage}`);
  if (tool.name === 'tavily_search') {
    if (args.include_domains_mode && !args.include_domains?.length) throw new Error('include_domains_mode requires include_domains');
    if (args.filter_by_language && !args.language) throw new Error('filter_by_language requires language');
    if (args.safe_search && ['fast', 'ultra-fast'].includes(args.search_depth)) throw new Error('safe_search is unavailable with fast or ultra-fast');
    if (args.chunks_per_source !== undefined && args.search_depth === 'ultra-fast') throw new Error('chunks_per_source is unavailable with ultra-fast');
    if (args.country && args.topic && args.topic !== 'general') throw new Error('country requires topic general');
  }
  if (tool.name === 'tavily_extract' && args.chunks_per_source !== undefined && !args.query) throw new Error('chunks_per_source requires query');
  if (tool.name === 'tavily_crawl' && args.chunks_per_source !== undefined && !args.instructions) throw new Error('chunks_per_source requires instructions');
}
