![GitHub Repo stars](https://img.shields.io/github/stars/tavily-ai/tavily-mcp?style=social)
![npm](https://img.shields.io/npm/dt/tavily-mcp)
![smithery badge](https://smithery.ai/badge/@tavily-ai/tavily-mcp)

![MCP demo](./assets/demo_new.gif)

The Tavily MCP server provides:
- search, extract, map, crawl tools
- Real-time web search capabilities through the tavily-search tool
- Intelligent data extraction from web pages via the tavily-extract tool
- Powerful web mapping tool that creates a structured map of website 
- Web crawler that systematically explores websites 


### 📚 Helpful Resources
- [Tutorial](https://medium.com/@dustin_36183/building-a-knowledge-graph-assistant-combining-tavily-and-neo4j-mcp-servers-with-claude-db92de075df9) on combining Tavily MCP with Neo4j MCP server
- [Tutorial](https://medium.com/@dustin_36183/connect-your-coding-assistant-to-the-web-integrating-tavily-mcp-with-cline-in-vs-code-5f923a4983d1) on integrating Tavily MCP with Cline in VS Code

## Remote MCP Server

Connect directly to Tavily's remote MCP server instead of running it locally. This provides a seamless experience without requiring local installation or configuration.

Simply use the remote MCP server URL with your Tavily API key:

``` 
https://mcp.tavily.com/mcp/?tavilyApiKey=<your-api-key> 
```
 Get your Tavily API key from [tavily.com](https://www.tavily.com/).

Alternatively, you can pass your API key through an Authorization header if the MCP client supports this:

```
Authorization: Bearer <your-api-key>
```
**Note:** When using the remote MCP, you can specify default parameters for all requests by including a `DEFAULT_PARAMETERS` header containing a JSON object with your desired defaults. Example:


```json
{"include_images":true, "search_depth": "basic", "max_results": 10}
```
### Connect to Cursor
[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tavily-remote-mcp&config=eyJjb21tYW5kIjoibnB4IC15IG1jcC1yZW1vdGUgaHR0cHM6Ly9tY3AudGF2aWx5LmNvbS9tY3AvP3RhdmlseUFwaUtleT08eW91ci1hcGkta2V5PiIsImVudiI6e319)

Click the ⬆️ Add to Cursor ⬆️ button, this will do most of the work for you but you will still need to edit the configuration to add your API-KEY. You can get a Tavily API key [here](https://www.tavily.com/).


once you click the button you should be redirect to Cursor ...

### Step 1
Click the install button

![](assets/cursor-step1.png)


### Step 2
You should see the MCP is now installed, if the blue slide is not already turned on, manually turn it on. You also need to edit the configuration to include your own Tavily API key.
![](assets/cursor-step2.png)

### Step 3
You will then be redirected to your `mcp.json` file where you have to add `your-api-key`.

```json
{
  "mcpServers": {
    "tavily-remote-mcp": {
      "command": "npx -y mcp-remote https://mcp.tavily.com/mcp/?tavilyApiKey=<your-api-key>",
      "env": {}
    }
  }
}
```

### Connect to Claude Desktop

Claude desktop now supports adding `integrations` which is currently in beta. An integration in this case is the Tavily Remote MCP, below I will explain how to add the MCP as an `integration` in Claude desktop.

### Step 1 
open claude desktop, click the button with the two sliders and then navigate to add integrations.
![](assets/claude-step1.png)

### Step 2
click `Add integrations`
![](assets/claude-step2.png)

### Step 3
Name the integration and insert the Tavily remote MCP url with your API key. You can get a Tavily API key [here](https://www.tavily.com/). Click `Add` to confirm.
![](assets/claude-step3.png)

### Step 4
Retrun to the chat screen and you will see the Tavily Remote MCP is now connected to Claude desktop.
![](assets/claude-step4.png)

### OpenAI 
Allow models to use remote MCP servers to perform tasks.
- You first need to export your OPENAI_API_KEY
- You must also add your Tavily API-key to `<your-api-key>`, you can get a Tavily API key [here](https://www.tavily.com/)

```python
from openai import OpenAI

client = OpenAI()

resp = client.responses.create(
    model="gpt-4.1",
    tools=[
        {
            "type": "mcp",
            "server_label": "tavily",
            "server_url": "https://mcp.tavily.com/mcp/?tavilyApiKey=<your-api-key>",
            "require_approval": "never",
        },
    ],
    input="Do you have access to the tavily mcp server?",
)

print(resp.output_text)
```

### Clients that don't support remote MCPs

mcp-remote is a lightweight bridge that lets MCP clients that can only talk to local (stdio) servers securely connect to remote MCP servers over HTTP + SSE with OAuth-based auth, so you can host and update your server in the cloud while existing clients keep working. It serves as an experimental stop-gap until popular MCP clients natively support remote, authorized servers.

```json
{
    "tavily-remote": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.tavily.com/mcp/?tavilyApiKey=<your-api-key>"
      ]
    }
}
```


## Local MCP 

### Prerequisites 🔧

Before you begin, ensure you have:

- [Tavily API key](https://app.tavily.com/home)
  - If you don't have a Tavily API key, you can sign up for a free account [here](https://app.tavily.com/home)
- [Claude Desktop](https://claude.ai/download) or [Cursor](https://cursor.sh)
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
npx -y tavily-mcp@latest 
```

### Installing via Smithery

To install Tavily MCP Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@tavily-ai/tavily-mcp):

```bash
npx -y @smithery/cli install @tavily-ai/tavily-mcp --client claude
```

Although you can launch a server on its own, it's not particularly helpful in isolation. Instead, you should integrate it into an MCP client. Below is an example of how to configure the Claude Desktop app to work with the tavily-mcp server.


## Configuring MCP Clients ⚙️

This repository will explain how to configure [VS Code](https://code.visualstudio.com), [Cursor](https://cursor.sh) and [Claude Desktop](https://claude.ai/desktop) to work with the tavily-mcp server.

### Configuring VS Code 💻

For one-click installation, click one of the install buttons below:

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=tavily&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22tavily-mcp%400.1.4%22%5D%2C%22env%22%3A%7B%22TAVILY_API_KEY%22%3A%22%24%7Binput%3Atavily_api_key%7D%22%7D%7D&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22tavily_api_key%22%2C%22description%22%3A%22Tavily+API+Key%22%2C%22password%22%3Atrue%7D%5D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=tavily&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22tavily-mcp%400.1.4%22%5D%2C%22env%22%3A%7B%22TAVILY_API_KEY%22%3A%22%24%7Binput%3Atavily_api_key%7D%22%7D%7D&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22tavily_api_key%22%2C%22description%22%3A%22Tavily+API+Key%22%2C%22password%22%3Atrue%7D%5D&quality=insiders)

### Manual Installation

First check if there are install buttons at the top of this section that match your needs. If you prefer manual installation, follow these steps:

Add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` (or `Cmd + Shift + P` on macOS) and typing `Preferences: Open User Settings (JSON)`.

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "tavily_api_key",
        "description": "Tavily API Key",
        "password": true
      }
    ],
    "servers": {
      "tavily": {
        "command": "npx",
        "args": ["-y", "tavily-mcp@latest"],
        "env": {
          "TAVILY_API_KEY": "${input:tavily_api_key}"
        }
      }
    }
  }
}
```

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "tavily_api_key",
      "description": "Tavily API Key",
      "password": true
    }
  ],
  "servers": {
    "tavily": {
      "command": "npx",
      "args": ["-y", "tavily-mcp@latest"],
      "env": {
        "TAVILY_API_KEY": "${input:tavily_api_key}"
      }
    }
  }
}
```

### Configuring Cline 🤖

The easiest way to set up the Tavily MCP server in Cline is through the marketplace with a single click:

1. Open Cline in VS Code
2. Click on the Cline icon in the sidebar
3. Navigate to the "MCP Servers" tab ( 4 squares )
4. Search "Tavily" and click "install"
5. When prompted, enter your Tavily API key

Alternatively, you can manually set up the Tavily MCP server in Cline:

1. Open the Cline MCP settings file:

   ### For macOS:
   ```bash
   # Using Visual Studio Code
   code ~/Library/Application\ Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
   
   # Or using TextEdit
   open -e ~/Library/Application\ Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
   ```

   ### For Windows:
   ```bash
   code %APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json
   ```

2. Add the Tavily server configuration to the file:

   Replace `your-api-key-here` with your actual [Tavily API key](https://tavily.com/api-keys).

   ```json
   {
     "mcpServers": {
       "tavily-mcp": {
         "command": "npx",
         "args": ["-y", "tavily-mcp@latest"],
         "env": {
           "TAVILY_API_KEY": "your-api-key-here"
         },
         "disabled": false,
         "autoApprove": []
       }
     }
   }
   ```

3. Save the file and restart Cline if it's already running.

4. When using Cline, you'll now have access to the Tavily MCP tools. You can ask Cline to use the tavily-search and tavily-extract tools directly in your conversations.


### Configuring the Claude Desktop app 🖥️
### For macOS:

```bash
# Create the config file if it doesn't exist
touch "$HOME/Library/Application Support/Claude/claude_desktop_config.json"

# Opens the config file in TextEdit 
open -e "$HOME/Library/Application Support/Claude/claude_desktop_config.json"

# Alternative method using Visual Studio Code (requires VS Code to be installed)
code "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
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
      "args": ["-y", "tavily-mcp@latest"],
      "env": {
        "TAVILY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 2. Git Installation

1. Clone the repository:
```bash
git clone https://github.com/tavily-ai/tavily-mcp.git
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

## Default Parameters Configuration ⚙️

You can set default parameter values for the `tavily-search` tool using the `DEFAULT_PARAMETERS` environment variable. This allows you to configure default search behavior without specifying these parameters in every request.

### Example Configuration

```bash
export DEFAULT_PARAMETERS='{"include_images": true}'
```

### Example usage from Client
```json
{
  "mcpServers": {
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "tavily-mcp@latest"],
      "env": {
        "TAVILY_API_KEY": "your-api-key-here",
        "DEFAULT_PARAMETERS": "{\"include_images\": true, \"max_results\": 15, \"search_depth\": \"advanced\"}"
      }
    }
  }
}
```

## Acknowledgments ✨

- [Model Context Protocol](https://modelcontextprotocol.io) for the MCP specification
- [Anthropic](https://anthropic.com) for Claude Desktop
