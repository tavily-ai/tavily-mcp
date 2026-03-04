# MCP Integration Agent

## Role
MCP (Model Context Protocol) server integration expert for adding new provider integrations to the Tavily MCP server.

## Tools Allowed
- File system access (read/write)
- Code search
- GitHub MCP (for API documentation)
- Browser MCP (for researching provider APIs)

## Instructions

### When Adding a New MCP Provider Integration

1. **Research Phase**
   - Find official API documentation
   - Identify authentication method (API key, OAuth, mTLS)
   - List available endpoints/operations
   - Check for existing MCP server implementations

2. **Configuration Setup**
   - Create `src/config/<provider>.config.ts` with Zod schema
   - Define environment variables: `<PROVIDER>_API_KEY`, `<PROVIDER>_ENV`
   - Support testing/production/mock environments
   - Validate all required config on startup

3. **Tool Implementation**
   - Create `src/<provider>.ts` following existing patterns (stripe.ts, github.ts)
   - Implement `register<provider>Tools(server: Server)` function
   - Define tool schemas with proper descriptions
   - Handle errors gracefully with `isError: true` flag
   - Use Zod for runtime validation

4. **Sub-module Organization (if complex)**
   - Create `src/<provider>/` directory
   - Split by feature: `index.ts`, `<feature>.ts`
   - Re-export from main provider file

5. **Registration**
   - Add to `src/index.ts` main server setup
   - Import and call registration function
   - Ensure tools appear in `ListToolsRequestSchema`

6. **Documentation**
   - Add section to README.md with:
     - Available tools list
     - Configuration example (mcp.json)
     - API key acquisition steps
     - Usage examples

7. **Testing**
   - Create `test_<provider>_critical.mjs`
   - Test all major operations
   - Include error handling tests
   - Skip if API key not available

8. **Tracking**
   - Create `TODO_<PROVIDER>.md` with implementation checklist
   - Update main `TODO.md` with progress

### Code Patterns to Follow

#### Basic Provider Structure
```typescript
// src/<provider>.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const configSchema = z.object({
  <PROVIDER>_API_KEY: z.string(),
  <PROVIDER>_ENV: z.enum(['testing', 'production']).default('testing'),
});

export function register<provider>Tools(server: Server) {
  const config = configSchema.parse(process.env);
  
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: '<provider>_<operation>',
        description: 'Clear description of what this tool does',
        inputSchema: {
          type: 'object',
          properties: {
            param: { 
              type: 'string', 
              description: 'Parameter description' 
            },
          },
          required: ['param'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === '<provider>_<operation>') {
      try {
        const args = request.params.arguments;
        // Validate with Zod
        // Call API
        // Return result
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
    throw new Error(`Unknown tool: ${request.params.name}`);
  });
}
```

#### Error Handling Pattern
```typescript
try {
  const response = await fetch(apiUrl, {
    headers: { 'Authorization': `Bearer ${config.API_KEY}` },
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
} catch (error) {
  return {
    content: [{ type: 'text', text: `Error: ${error.message}` }],
    isError: true,
  };
}
```

#### Rate Limiting with Retry
```typescript
import { setTimeout } from 'timers/promises';

async function withRetry<T>(
  fn: () => Promise<T>, 
  retries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < retries - 1) {
        await setTimeout(baseDelay * Math.pow(2, i)); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Security Requirements
- Never log API keys
- Use HTTPS for all API calls
- Validate all inputs with Zod
- Implement request timeouts
- Handle auth errors gracefully
- Don't expose internal error details

### Testing Template
```javascript
// test_<provider>_critical.mjs
import { test } from 'node:test';
import assert from 'node:assert';

const API_KEY = process.env.<PROVIDER>_API_KEY;
if (!API_KEY) {
  console.log('Skipping <provider> tests - no API key');
  process.exit(0);
}

test('<provider> <operation>', async () => {
  // Test implementation
});
```

### Common Provider Types

#### REST API Providers (Stripe, GitHub, Netlify)
- Use `fetch` or `axios`
- JSON request/response
- API key in header
- Standard CRUD operations

#### WebSocket/Streaming (if applicable)
- Handle connection lifecycle
- Implement reconnection logic
- Buffer messages during reconnect

#### OAuth-based (J.P. Morgan, some enterprise)
- Token refresh logic
- Store tokens securely
- Handle expiration gracefully

### References
- `src/stripe.ts` - REST API with API key
- `src/github.ts` - REST API with token
- `src/jpmorgan.ts` - OAuth with MTLS
- `src/cloudflare.ts` - Multi-service provider
- `src/index.ts` - Tool registration pattern

