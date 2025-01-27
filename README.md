# Tavily MCP Server 🚀

INCLUDE A EMBEDED VIDEO DEMO

The Model Context Protocol (MCP) is an open standard that enables AI systems to interact seamlessly with various data sources and tools, facilitating secure, two-way connections.

Developed by Anthropic, the Model Context Protocol (MCP) enables AI assistants like Claude to seamlessly integrate with Tavily's advanced search and data extraction capabilities. This integration provides AI models with real-time access to web information, complete with sophisticated filtering options and domain-specific search features.

The Tavily MCP server provides:
- Seamless interation with the tavily-search and tavily-extract tools
- Real-time web search capabilities through the tavily-search tool
- Intelligent data extraction from web pages via the tavily-extract tool


## Usage 🔧

Before you begin, ensure you have:

- [Tavily API key](https://tavily.com/api-keys)
- [Claude Desktop](https://claude.ai/download)
- [Node.js](https://nodejs.org/) (v20 or higher)
  - You can verify your Node.js installation by running:
    - `node --version`
- [Git](https://git-scm.com/downloads) installed
  - On macOS: `brew install git`
  - On Linux: 
    - Debian/Ubuntu: `sudo apt install git`
    - RedHat/CentOS: `sudo yum install git`
  - On Windows: Download [Git for Windows](https://git-scm.com/download/win)

### Tavily MCP server installation 🔨

### NPM Installation

```bash
npm install -g tavily-mcp
```

### Git Installation

1. Clone the repository:
```bash
git clone https://github.com/tavily/tavily-mcp.git
cd tavily-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration ⚙️

### 1. Configure Claude Desktop

Enable Developer Mode in Claude Desktop and open the configuration file:

#### For macOS:
```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

#### For Windows:
```bash
code %APPDATA%\Claude\claude_desktop_config.json
```

### 2. Add the Tavily server configuration:

```json
{
  "mcpServers": {
    "tavily": {
      "command": "npx",
      "args": ["/path/to/tavily-mcp/build/index.js"],
      "env": {
        "TAVILY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Replace `your-api-key-here` with your actual Tavily API key.

## Usage 🎯

The server provides three main search tools:

1. **General Web Search**:
```
Can you search for recent developments in quantum computing?
```

2. **News Search**:
```
Search for news articles about AI startups from the last 7 days.
```

3. **Domain-Specific Search**:
```
Search for climate change research on nature.com and sciencedirect.com
```

## Features ✨

- **Multiple Search Types**: General web search, news search, and answer generation
- **Domain Filtering**: Include or exclude specific websites from search results
- **Time-Based Filtering**: Filter news by recency
- **Error Handling**: Graceful handling of API errors and rate limits
- **Type Safety**: Full TypeScript implementation with proper type checking

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

## Troubleshooting 🔧

### Common Issues

1. **Server Not Found**
   - Verify the npm installation
   - Check Claude Desktop configuration syntax
   - Ensure Node.js is properly installed

2. **API Key Issues**
   - Confirm your Tavily API key is valid
   - Check the API key is correctly set in the config
   - Verify no spaces or quotes around the API key

3. **Debugging**
   - Use the MCP Inspector for detailed debugging:
   ```bash
   npm run inspector
   ```

## Acknowledgments 🙏

- [Tavily](https://tavily.com) for their powerful search API
- [Model Context Protocol](https://modelcontextprotocol.io) for the MCP specification
- [Anthropic](https://anthropic.com) for Claude Desktop

