# Tavily MCP Server 🚀

INCLUDE A EMBEDED VIDEO DEMO

The Model Context Protocol (MCP) is an open standard that enables AI systems to interact seamlessly with various data sources and tools, facilitating secure, two-way connections.

Developed by Anthropic, the Model Context Protocol (MCP) enables AI assistants like Claude to seamlessly integrate with Tavily's advanced search and data extraction capabilities. This integration provides AI models with real-time access to web information, complete with sophisticated filtering options and domain-specific search features.

The Tavily MCP server provides:
- Seamless interation with the tavily-search and tavily-extract tools
- Real-time web search capabilities through the tavily-search tool
- Intelligent data extraction from web pages via the tavily-extract tool


## Prerequisites 🔧

Before you begin, ensure you have:

- [Tavily API key](https://tavily.com/api-keys)
- [Claude Desktop](https://claude.ai/download)
- [Node.js](https://nodejs.org/) (v20 or higher)
  - You can verify your Node.js installation by running:
    - `node --version`
- [Git](https://git-scm.com/downloads) installed (only needed if using Git installation method)
  - On macOS: `brew install git`
  - On Linux: 
    - Debian/Ubuntu: `sudo apt install git`
    - RedHat/CentOS: `sudo yum install git`
  - On Windows: Download [Git for Windows](https://git-scm.com/download/win)

## Tavily MCP server installation ⚡

### Running with NPX 

```bash
npx -y tavily-mcp@0.1.2    
```

Although you can launch a server on its own, it's not particularly helpful in isolation. Instead, you should integrate it into an MCP client. Below is an example of how to configure the Claude Desktop app to work with the tavily-mcp server.

### Configuring the Claude Desktop app ⚙️
### For macOS:

```bash
# Create the config file if it doesn't exist
touch ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Opens the config file in Visual Studio Code (requires VS Code to be installed)
code ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Alternative methods if VS Code is not installed:
open -e ~/Library/Application\ Support/Claude/claude_desktop_config.json  # Opens with TextEdit
```

### For Windows:
```bash
code %APPDATA%\Claude\claude_desktop_config.json
```

### Add the Tavily server configuration:

Replace `your-api-key-here` with your actual [Tavily API key](https://tavily.com/api-keys).

```json
{
  "mcpServers": {
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "tavily-mcp@0.1.2"],
      "env": {
        "TAVILY_API_KEY": "your-api-key-here"
      }
    }
  }
}
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
### Configuring the Claude Desktop app ⚙️
Follow the configuration steps outlined in the [Configuring the Claude Desktop app](#configuring-the-claude-desktop-app-️) section above, using the below JSON configuration.

Replace `your-api-key-here` with your actual [Tavily API key](https://tavily.com/api-keys) and `/path/to/tavily-mcp` with the actual path where you cloned the repository on your system.

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

## Usage in Claude Desktop App 🎯

Once the installation is complete, and the Claude desktop app is configured, you must completely close and re-open the Claude desktop app to see the tavily-mcp server. You should see a hammer icon in the bottom left of the app, indicating available MCP tools, you can click on the hammer icon to see more detial on the tavily-search and tavily-extract tools.

![Alt text](/tavily-mcp/imgs/claude-desktop-ref.png)

Now claude will have complete access to the tavily-mcp server, including the tavily-search and tavily-extract tools. If you insert the below examples into the Claude desktop app, you should see the tavily-mcp server tools in action.

### Tavily Search Examples

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

### Tavily Extract Examples 

1. **Extract Article Content**:
```
Extract the main content from this article: https://example.com/article
```

### ✨ Combine Search and Extract ✨

You can also combine the tavily-search and tavily-extract tools to perform more complex tasks.

```
Search for news articles about AI startups from the last 7 days and extract the main content from each article to generate a detailed report.
```

## Troubleshooting 🛠️

### Common Issues

1. **Server Not Found**
   - Verify the npm installation by running `npm --verison`
   - Check Claude Desktop configuration syntax by running `code ~/Library/Application\ Support/Claude/claude_desktop_config.json`
   - Ensure Node.js is properly installed by running `node --version`
   
2. **NPX related issues**
  - If you encounter errors related to `npx`, you may need to use the full path to the npx executable instead. 
  - You can find this path by running `which npx` in your terminal, then replace the `"command":  "npx"` line with `"command": "/full/path/to/npx"` in your configuration.

3. **API Key Issues**
   - Confirm your Tavily API key is valid
   - Check the API key is correctly set in the config
   - Verify no spaces or quotes around the API key

## Acknowledgments ✨

- [Tavily](https://tavily.com) for their powerful search API
- [Model Context Protocol](https://modelcontextprotocol.io) for the MCP specification
- [Anthropic](https://anthropic.com) for Claude Desktop

