# MCP Integration Prompt

## Context
Adding a new MCP (Model Context Protocol) server integration to the Tavily MCP server.

## Input
- Provider name: <provider-name>
- API documentation URL: <api-docs-url>
- Authentication type: <api-key|oauth|mtls|other>
- Key operations to expose: <operation-list>

## Tasks

### 1. Create Provider Configuration
```typescript
// src/config/<provider>.config.ts
import { z } from 'zod';

export const <provider>ConfigSchema = z.object({
  <PROVIDER>_API_KEY: z.string().min(1),
  <PROVIDER>_ENV: z.enum(['testing', 'production']).default('testing'),
  // Add other config fields
});

export type <provider>Config = z.infer<typeof <provider>ConfigSchema>;

export function get<provider>Config(): <provider>Config {
  return <provider>ConfigSchema.parse(process.env);
}
```

### 2. Implement MCP Tools
```typescript
// src/<provider>.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export function register<provider>Tools(server: Server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: '<provider>_<operation>',
        description: 'Description of what this tool does',
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string', description: 'Parameter description' },
          },
          required: ['param1'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === '<provider>_<operation>') {
      // Implementation
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    }
    throw new Error(`Unknown tool: ${request.params.name}`);
  });
}
```

### 3. Create Sub-module Structure (if needed)
```typescript
// src/<provider>/index.ts
export * from './<feature>.js';

// src/<provider>/<feature>.ts
export async function <feature>Operation(params: any) {
  // Implementation
}
```

### 4. Register in Main Index
```typescript
// src/index.ts
import { register<provider>Tools } from './<provider>.js';

// In server setup
register<provider>Tools(server);
```

### 5. Update README
Add section to README.md:
```markdown
## <Provider> MCP Server

### Available Tools
- `<provider>_<operation>` - Description

### Configuration
\`\`\`json
{
  "mcpServers": {
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "tavily-mcp@latest"],
      "env": {
        "TAVILY_API_KEY": "your-tavily-api-key",
        "<PROVIDER>_API_KEY": "your-provider-api-key"
      }
    }
  }
}
\`\`\`

### Getting API Keys
1. Visit [provider website]
2. Sign up for an account
3. Generate API key
```

### 6. Create Integration Test
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
  const result = await fetch('http://localhost:3000/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: '<provider>_<operation>',
      arguments: { param1: 'test' },
    }),
  });
  
  assert.strictEqual(result.status, 200);
  const data = await result.json();
  assert.ok(data.content);
});
```

### 7. Create TODO Tracking File
```markdown
# TODO: <Provider> Integration

## Implementation
- [ ] Config schema
- [ ] Tool implementations
- [ ] Error handling
- [ ] README documentation

## Testing
- [ ] Unit tests
- [ ] Integration test (test_<provider>_critical.mjs)
- [ ] Error path testing

## Deployment
- [ ] Environment variables documented
- [ ] Production credentials configured
- [ ] Monitoring alerts set up
```

## Best Practices

### Error Handling
```typescript
try {
  const result = await apiCall();
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
} catch (error) {
  return {
    content: [{ type: 'text', text: `Error: ${error.message}` }],
    isError: true,
  };
}
```

### Rate Limiting
```typescript
import { setTimeout } from 'timers/promises';

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < retries - 1) {
        await setTimeout(1000 * Math.pow(2, i)); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Security
- Never log API keys
- Validate all inputs with Zod
- Use HTTPS for all API calls
- Implement request timeouts
- Handle authentication errors gracefully

## Checklist
- [ ] Config validation with Zod
- [ ] Tool schema documented
- [ ] Error responses formatted correctly
- [ ] README updated with setup instructions
- [ ] Integration test created
- [ ] TODO file created
- [ ] Follows existing provider patterns (see stripe.ts, github.ts)

