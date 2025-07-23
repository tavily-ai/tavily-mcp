import { TavilyClientCore } from "./core/tavily-client.js";
import { formatResults, formatCrawlResults, formatMapResults } from "./utils/formatters.js";
import type { Env } from "../worker-configuration.js";

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const tavilyClient = new TavilyClientCore();

    try {
      // Handle different endpoints
      if (url.pathname === '/') {
        return new Response('Tavily MCP Server - Running on Cloudflare Workers', {
          headers: { 'Content-Type': 'text/plain', ...corsHeaders }
        });
      }

      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ 
          status: 'healthy', 
          timestamp: new Date().toISOString(),
          version: '0.3.0'
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (url.pathname === '/search' && request.method === 'POST') {
        const params = await request.json();
        const response = await tavilyClient.search(params, env.TAVILY_API_KEY);
        return new Response(JSON.stringify({
          success: true,
          data: response,
          formatted: formatResults(response)
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (url.pathname === '/extract' && request.method === 'POST') {
        const params = await request.json();
        const response = await tavilyClient.extract(params, env.TAVILY_API_KEY);
        return new Response(JSON.stringify({
          success: true,
          data: response,
          formatted: formatResults(response)
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (url.pathname === '/crawl' && request.method === 'POST') {
        const params = await request.json();
        const response = await tavilyClient.crawl(params, env.TAVILY_API_KEY);
        return new Response(JSON.stringify({
          success: true,
          data: response,
          formatted: formatCrawlResults(response)
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (url.pathname === '/map' && request.method === 'POST') {
        const params = await request.json();
        const response = await tavilyClient.map(params, env.TAVILY_API_KEY);
        return new Response(JSON.stringify({
          success: true,
          data: response,
          formatted: formatMapResults(response)
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (url.pathname === '/tools') {
        const tools = tavilyClient.getTools();
        return new Response(JSON.stringify({
          success: true,
          tools: tools
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      return new Response('Endpoint not found', { 
        status: 404,
        headers: { 'Content-Type': 'text/plain', ...corsHeaders }
      });

    } catch (error: any) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  },
};