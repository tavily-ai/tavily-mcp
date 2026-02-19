# Tavily MCP Server

![GitHub Repo stars](https://img.shields.io/github/stars/tavily-ai/tavily-mcp?style=social)
![npm](https://img.shields.io/npm/dt/tavily-mcp)
![smithery badge](https://smithery.ai/badge/@tavily-ai/tavily-mcp)

The Tavily MCP server provides:

- search, extract, map, crawl tools
- Real-time web search capabilities through the tavily-search tool
- Intelligent data extraction from web pages via the tavily-extract tool
- Powerful web mapping tool that creates a structured map of website
- Web crawler that systematically explores websites

## Helpful Resources

- [Tutorial](https://medium.com/@dustin_36183/building-a-knowledge-graph-assistant-combining-tavily-and-neo4j-mcp-servers-with-claude-db92de075df9) on combining Tavily MCP with Neo4j MCP server
- [Tutorial](https://medium.com/@dustin_36183/connect-your-coding-assistant-to-the-web-integrating-tavily-mcp-with-cline-in-vs-code-5f923a4983d1) on integrating Tavily MCP with Cline in VS Code

## Remote MCP Server

Connect directly to Tavily's remote MCP server instead of running it locally. This provides a seamless experience without requiring local installation or configuration.

Simply use the remote MCP server URL with your Tavily API key:

```text
https://mcp.tavily.com/mcp/?tavilyApiKey=<your-api-key>
```

Get your Tavily API key from [tavily.com](https://www.tavily.com/).

Alternatively, you can pass your API key through an Authorization header if the MCP client supports this:

```text
Authorization: Bearer <your-api-key>
```

**Note:** When using the remote MCP, you can specify default parameters for all requests by including a `DEFAULT_PARAMETERS` header containing a JSON object with your desired defaults. Example:

```json
{"include_images":true, "search_depth": "basic", "max_results": 10}
```

## Connect to Claude Code

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) is Anthropic's official CLI tool for Claude. You can add the Tavily MCP server using the `claude mcp add` command. There are two ways to authenticate:

### Option 1: API Key in URL

Pass your API key directly in the URL. Replace `<your-api-key>` with your actual [Tavily API key](https://www.tavily.com/):

```bash
claude mcp add --transport http tavily https://mcp.tavily.com/mcp/?tavilyApiKey=<your-api-key>
```

### Option 2: OAuth Authentication Flow

Add the server without an API key in the URL:

```bash
claude mcp add --transport http tavily https://mcp.tavily.com/mcp
```

After adding, you'll need to complete the authentication flow:

1. Run `claude` to start Claude Code
2. Type `/mcp` to open the MCP server management
3. Select the Tavily server and complete the authentication process

**Tip:** Add `--scope user` to either command to make the Tavily MCP server available globally across all your projects:

```bash
claude mcp add --transport http --scope user tavily https://mcp.tavily.com/mcp/?tavilyApiKey=<your-api-key>
```

Once configured, you'll have access to the Tavily search, extract, map, and crawl tools.

## Connect to Cursor

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tavily-remote-mcp&config=eyJjb21tYW5kIjoibnB4IC15IG1jcC1yZW1vdGUgaHR0cHM6Ly9tY3AudGF2aWx5LmNvbS9tY3AvP3RhdmlseUFwaUtleT08eW91ci1hcGkta2V5PiIsImVudiI6e319)

Click the ⬆️ Add to Cursor ⬆️ button, this will do most of the work for you but you will still need to edit the configuration to add your API-KEY. You can get a Tavily API key by [signing up for a free account](https://www.tavily.com/).

Once you click the button you should be redirect to Cursor ...

### Step 1

Click the install button

![Cursor step 1](assets/cursor-step1.png)

### Step 2

You should see the MCP is now installed, if the blue slide is not already turned on, manually turn it on. You also need to edit the configuration to include your own Tavily API key.

![Cursor step 2](assets/cursor-step2.png)

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

### Remote MCP Server OAuth Flow

The Tavily Remote MCP server supports secure OAuth authentication, allowing you to connect and authorize seamlessly with compatible clients.

#### How to Set Up OAuth Authentication

**A. Using MCP Inspector:**

- Open the MCP Inspector and click "Open Auth Settings".
- Select the OAuth flow and complete these steps:
  1. Metadata discovery
  2. Client registration
  3. Preparing authorization
  4. Request authorization and obtain the authorization code
  5. Token request
  6. Authentication complete

Once finished, you will receive an access token that lets you securely make authenticated requests to the Tavily Remote MCP server.

**B. Using other MCP Clients (Example: Cursor):**

You can configure your MCP client to use OAuth without including your Tavily API key in the URL. For example, in your `mcp.json`:

```json
{
  "mcpServers": {
    "tavily-remote-mcp": {
      "command": "npx mcp-remote https://mcp.tavily.com/mcp",
      "env": {}
    }
  }
}
```

If you need to clear stored OAuth credentials and reauthenticate, run:

```bash
rm -rf ~/.mcp-auth
```

> **Note:**
>
> - OAuth authentication is optional. You can still use API key authentication at any time by including your Tavily API key in the URL query parameter (`?tavilyApiKey=...`) or by setting it in the `Authorization` header, as described above.

#### Selecting Which API Key Is Used for OAuth

After successful OAuth authentication, you can control which API key is used by naming it `mcp_auth_default`:

- If you set a key named `mcp_auth_default` in your **personal account**, that key will be used for the auth flow.
- If you are part of a **team** that has a key named `mcp_auth_default`, that key will be used for the auth flow.
- If you have **both** a personal key and a team key named `mcp_auth_default`, the **personal key will be prioritized**.
- If no `mcp_auth_default` key is set, the `default` key in your personal account will be used. If no `default` key is set, the first available key will be used.

## Local MCP

### Prerequisites

Before you begin, ensure you have:

- [Tavily API key](https://app.tavily.com/home)
  - If you don't have a Tavily API key, you can sign up for a free account [on the Tavily website](https://app.tavily.com/home)
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

### Running with NPX

```bash
npx -y tavily-mcp@latest
```

## Default Parameters Configuration

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

## Stripe Payment Integration

The Tavily MCP server includes Stripe payment integration for processing payments. This is useful if you want to integrate payment processing into your AI-powered applications.

### Available Stripe Tools

- `stripe_create_payment_intent` - Create a payment intent for collecting payments
- `stripe_get_payment_intent` - Retrieve a payment intent by ID
- `stripe_create_customer` - Create a new Stripe customer
- `stripe_get_customer` - Retrieve a customer by ID
- `stripe_list_charges` - List recent charges
- `stripe_create_checkout_session` - Create a Stripe checkout session
- `stripe_get_checkout_session` - Retrieve a checkout session

### Configuration

To enable Stripe functionality, set the `STRIPE_SECRET_KEY` environment variable with your Stripe secret key:

```bash
export STRIPE_SECRET_KEY="sk_test_your_stripe_secret_key"
```

### Stripe Example Usage

```json
{
  "mcpServers": {
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "tavily-mcp@latest"],
      "env": {
        "TAVILY_API_KEY": "your-api-key-here",
        "STRIPE_SECRET_KEY": "sk_test_your_stripe_secret_key"
      }
    }
  }
}
```

> **Security Note:** Never hardcode your Stripe secret key in source code or configuration files that are committed to version control. Always use environment variables.

## Cloudflare MCP Servers

The Tavily MCP server also provides integration with Cloudflare's MCP servers for additional capabilities. These can be added as remote MCP servers to your client configuration.

### Available Cloudflare MCP Servers

| Service | URL | Description |
| ------- | --- | ----------- |
| Observability | `https://observability.mcp.cloudflare.com/mcp` | Monitoring, logs, and metrics |
| Radar | `https://radar.mcp.cloudflare.com/mcp` | Security analytics and threat data |
| Browser | `https://browser.mcp.cloudflare.com/mcp` | Web browsing and page rendering |

### Connecting to Cloudflare MCP Servers

#### Claude Desktop

Add Cloudflare MCP servers to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "cloudflare-observability": {
      "command": "npx",
      "args": ["-y", "@cloudflare/mcp-server"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "your-api-token"
      }
    },
    "cloudflare-radar": {
      "command": "npx",
      "args": ["-y", "@cloudflare/mcp-server"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "your-api-token"
      }
    },
    "cloudflare-browser": {
      "command": "npx",
      "args": ["-y", "@cloudflare/mcp-server"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

Or using the remote server approach:

```json
{
  "mcpServers": {
    "cloudflare-observability": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://observability.mcp.cloudflare.com/mcp"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "your-api-token"
      }
    },
    "cloudflare-radar": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://radar.mcp.cloudflare.com/mcp"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "your-api-token"
      }
    },
    "cloudflare-browser": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://browser.mcp.cloudflare.com/mcp"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

#### Cursor

Add Cloudflare MCP servers to your Cursor configuration (`mcp.json`):

```json
{
  "mcpServers": {
    "cloudflare-observability": {
      "command": "npx",
      "args": ["-y", "@cloudflare/mcp-server"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "your-api-token"
      }
    },
    "cloudflare-radar": {
      "command": "npx",
      "args": ["-y", "@cloudflare/mcp-server"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "your-api-token"
      }
    },
    "cloudflare-browser": {
      "command": "npx",
      "args": ["-y", "@cloudflare/mcp-server"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

### Getting a Cloudflare API Token

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to Profile > API Tokens
3. Click "Create Token"
4. Choose a template or create a custom token
5. Ensure the token has appropriate permissions for the services you want to use

> **Note:** Some Cloudflare MCP servers may require specific API token permissions. Refer to the Cloudflare MCP server documentation for details.

## Eleven Labs MCP Server

The Tavily MCP server provides integration with Eleven Labs' MCP server for text-to-speech and voice synthesis capabilities.

### Available Eleven Labs Tools

When you add the Eleven Labs MCP server to your client, you'll have access to:

- `elevenlabs-text-to-speech` - Convert text to speech with various voices
- `elevenlabs-voices` - List available voices for synthesis
- `elevenlabs-models` - List available TTS models
- `elevenlabs-settings` - Get or set user preferences

### Connecting to Eleven Labs MCP Server

#### Claude Desktop (Eleven Labs)

Add the Eleven Labs MCP server to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "elevenlabs": {
      "command": "npx",
      "args": ["-y", "@elevenlabs/mcp-server"],
      "env": {
        "ELEVENLABS_API_KEY": "your-api-key"
      }
    }
  }
}
```

#### Cursor (Eleven Labs)

Add the Eleven Labs MCP server to your Cursor configuration (`mcp.json`):

```json
{
  "mcpServers": {
    "elevenlabs": {
      "command": "npx",
      "args": ["-y", "@elevenlabs/mcp-server"],
      "env": {
        "ELEVENLABS_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Getting an Eleven Labs API Key

1. Log in to the [Eleven Labs Dashboard](https://elevenlabs.io/app)
2. Go to Settings > API Keys
3. Click "Create API Key"
4. Copy your API key and use it in your MCP client configuration

> **Note:** The Eleven Labs MCP server requires an API key with appropriate permissions for text-to-speech operations.

### Resources

- [Eleven Labs Documentation](https://elevenlabs.io/docs)
- [Eleven Labs MCP GitHub](https://github.com/elevenlabs/elevenlabs-mcp)

## GitHub MCP Server

The Tavily MCP server provides integration with GitHub's MCP server for code scanning, issues, pull requests, and repository management capabilities.

### Available GitHub Tools

When you add the GitHub MCP server to your client, you'll have access to:

- `github-code-scanning` - Security vulnerability detection
- `github-issues` - Create, read, update, and search issues
- `github-pull-requests` - Create, read, update, and search PRs
- `github-repositories` - Manage repositories, branches, and commits
- `github-search` - Search code, issues, PRs, and repositories
- `github-actions` - Manage workflows and runs

### Connecting to GitHub MCP Server

#### Claude Desktop (GitHub)

Add the GitHub MCP server to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@github/mcp-server"],
      "env": {
        "GITHUB_TOKEN": "your-github-token"
      }
    }
  }
}
```

#### Cursor (GitHub)

Add the GitHub MCP server to your Cursor configuration (`mcp.json`):

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@github/mcp-server"],
      "env": {
        "GITHUB_TOKEN": "your-github-token"
      }
    }
  }
}
```

### Getting a GitHub Token

1. Log in to your GitHub account
2. Go to Settings > Developer settings > Personal access tokens
3. Click "Generate new token"
4. Select the scopes you need (repo, workflow, read:org, etc.)
5. Copy your token and use it in your MCP client configuration

> **Note:** The GitHub MCP server requires a token with appropriate permissions for the operations you want to perform.

### Resources

- [GitHub MCP Server](https://github.com/github/github-mcp-server)

## AgentQL MCP Server

The Tavily MCP server provides integration with AgentQL's MCP server for AI-powered web scraping and data extraction capabilities.

### Available AgentQL Tools

When you add the AgentQL MCP server to your client, you'll have access to:

- `query_data` - Extract structured data from any web page using AgentQL's GraphQL-like query language
- `get_web_element` - Locate and retrieve specific web elements from a page using natural language queries

### Connecting to AgentQL MCP Server

#### Claude Desktop (AgentQL)

Add the AgentQL MCP server to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "agentql": {
      "command": "npx",
      "args": ["-y", "agentql-mcp"],
      "env": {
        "AGENTQL_API_KEY": "your-api-key"
      }
    }
  }
}
```

#### Cursor (AgentQL)

Add the AgentQL MCP server to your Cursor configuration (`mcp.json`):

```json
{
  "mcpServers": {
    "agentql": {
      "command": "npx",
      "args": ["-y", "agentql-mcp"],
      "env": {
        "AGENTQL_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Getting an AgentQL API Key

1. Visit <https://agentql.com>
2. Sign up for an account or log in
3. Navigate to your account settings or API keys section
4. Generate a new API key
5. Copy your API key and use it in your MCP client configuration

> **Note:** The AgentQL MCP server requires an API key with appropriate permissions for web scraping operations.

### Resources

- [AgentQL MCP GitHub](https://github.com/tinyfish-io/agentql-mcp)

## Alby Bitcoin Lightning MCP Server

The Tavily MCP server provides integration with Alby's MCP server for Bitcoin Lightning wallet operations using Nostr Wallet Connect (NWC).

### Available Alby Tools

When you add the Alby MCP server to your client, you'll have access to:

**NWC Wallet Tools:**

- `get_balance` - Get the balance of the connected lightning wallet
- `get_info` - Get NWC capabilities and general information about the wallet and underlying lightning node
- `get_wallet_service_info` - Get NWC capabilities, supported encryption and notification types
- `lookup_invoice` - Look up lightning invoice details from a BOLT-11 invoice or payment hash
- `make_invoice` - Create a lightning invoice
- `pay_invoice` - Pay a lightning invoice
- `list_transactions` - List all transactions from the connected wallet with optional filtering

**Lightning Tools:**

- `fetch_l402` - Fetch a paid resource protected by L402 (Lightning HTTP 402 Payment Required)
- `fiat_to_sats` - Convert fiat currency amounts (e.g. USD, EUR) to satoshis
- `parse_invoice` - Parse a BOLT-11 lightning invoice and return its details
- `request_invoice` - Request a lightning invoice from a lightning address (LNURL)

### Connecting to Alby MCP Server

#### Option 1: Local (STDIO) — Claude Desktop

Add the Alby MCP server to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "alby": {
      "command": "npx",
      "args": ["-y", "@getalby/mcp"],
      "env": {
        "NWC_CONNECTION_STRING": "nostr+walletconnect://..."
      }
    }
  }
}
```

#### Option 1 (Cursor): Local (STDIO)

Add the Alby MCP server to your Cursor configuration (`mcp.json`):

```json
{
  "mcpServers": {
    "alby": {
      "command": "npx",
      "args": ["-y", "@getalby/mcp"],
      "env": {
        "NWC_CONNECTION_STRING": "nostr+walletconnect://..."
      }
    }
  }
}
```

#### Option 2: Remote Server

Connect directly to Alby's hosted MCP server (no local installation required):

- **HTTP Streamable:** `https://mcp.getalby.com/mcp`
- **SSE:** `https://mcp.getalby.com/sse`

**Bearer Authentication (preferred):**

```http
Authorization: Bearer nostr+walletconnect://...
```

**Query Parameter:**

```text
https://mcp.getalby.com/mcp?nwc=ENCODED_NWC_URL
```

#### Claude Code (Remote)

```bash
claude mcp add --transport http alby https://mcp.getalby.com/mcp --header "Authorization: Bearer nostr+walletconnect://..."
```

### Getting a NWC Connection String

1. Visit [nwc.getalby.com](https://nwc.getalby.com) or use any NWC-compatible Bitcoin Lightning wallet
2. Create a new connection and copy the connection string
3. The connection string starts with `nostr+walletconnect://`
4. Set it as the `NWC_CONNECTION_STRING` environment variable

> **Security Note:** Your NWC connection string grants access to your Bitcoin Lightning wallet. Never share it or commit it to version control. Always use environment variables.

### Resources

- [Alby MCP GitHub](https://github.com/getAlby/mcp)
- [Nostr Wallet Connect (NWC)](https://nwc.dev)
- [Alby Support](https://support.getalby.com)

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io) for the MCP specification
- [Anthropic](https://anthropic.com) for Claude Desktop
