# AgentQL MCP Integration - TODO

## Tasks

- [x] 1. Update src/agentql.ts - Fix npm package name, correct tool names, add actual API call functions
- [x] 2. Update src/index.ts - Add agentql_query_data and agentql_get_web_element tools with real handlers
- [x] 3. Update README.md - Correct AgentQL documentation with real tool names and usage
- [x] 4. Run npm run build - TypeScript compilation successful ✅

## All tasks completed

## Details

### AgentQL MCP Server (<https://github.com/tinyfish-io/agentql-mcp>)

- npm package: `agentql-mcp`
- API base: `https://api.agentql.com/v1/`
- Auth: `X-API-Key` header using `AGENTQL_API_KEY`
- Real tools:
  1. `query_data` - Query structured data from a web page using AgentQL query language
  2. `get_web_element` - Get web elements from a page

### Changes Required

#### src/agentql.ts

- Fix npm package name to `agentql-mcp`
- Fix tool names to match actual server
- Add queryData() function calling POST <https://api.agentql.com/v1/query-data>
- Add getWebElement() function calling POST <https://api.agentql.com/v1/get-web-element>
- Add TypeScript interfaces

#### src/index.ts

- Add agentql_query_data tool definition
- Add agentql_get_web_element tool definition
- Add handlers for both tools
- Update formatAgentQLServers() and formatAgentQLServerInfo()

#### README.md

- Update AgentQL section with correct npm package, tool names, and examples
