# GitHub Copilot Customization Guide

This repository includes a comprehensive GitHub Copilot customization setup tailored for the Tavily MCP server project with NestJS reference implementation, SOC 2 compliance, and multi-provider integrations.

## 📁 Customization Structure

```
.github/
├── copilot-instructions.md          # Global coding standards
├── COPILOT_CUSTOMIZATION_GUIDE.md   # This guide
├── prompts/                          # Reusable prompt templates
│   ├── deployment-checklist.prompt.md
│   ├── metrics-setup.prompt.md
│   ├── compliance-review.prompt.md
│   ├── mcp-integration.prompt.md
│   └── jpm-payment-flow.prompt.md
├── agents/                           # Specialized AI agents
│   ├── metrics-agent.md
│   ├── compliance-agent.md
│   ├── mcp-integration-agent.md
│   └── nestjs-architect-agent.md
└── skills/                           # Task-specific skill bundles
    ├── grafana-dashboards/SKILL.md
    ├── release-automation/SKILL.md
    └── security-audit/SKILL.md

mcp.json                              # MCP server configuration
```

## 🎯 Quick Start

### 1. Global Instructions (Always Active)
The `.github/copilot-instructions.md` file provides always-on rules for:
- TypeScript/MCP coding patterns
- NestJS module architecture
- SOC 2 compliance requirements
- Prometheus metrics conventions
- PII handling rules
- Security best practices

### 2. Prompt Templates (On-Demand)
Use these for specific tasks:

| Prompt | Use Case | Command |
|--------|----------|---------|
| `deployment-checklist` | Pre-deployment validation | "Run deployment checklist for v0.4.0" |
| `metrics-setup` | Add Prometheus metrics | "Set up metrics for new billing module" |
| `compliance-review` | SOC 2 code review | "Review payroll service for compliance" |
| `mcp-integration` | Add new MCP provider | "Integrate Plaid MCP server" |
| `jpm-payment-flow` | JPMorgan payment features | "Create vendor payment flow" |

### 3. Custom Agents (Specialized Expertise)
Invoke these agents for domain-specific help:

| Agent | Expertise | When to Use |
|-------|-----------|-------------|
| `@metrics-agent` | Prometheus/Grafana | Metrics design, Alloy config, dashboards |
| `@compliance-agent` | SOC 2/Security | Audit logging, PII handling, compliance |
| `@mcp-integration-agent` | MCP servers | New provider integrations, tool design |
| `@nestjs-architect-agent` | NestJS patterns | Module design, DI, testing |

### 4. Skills (Task Bundles)
Execute these for complex workflows:

| Skill | Tasks | Output |
|-------|-------|--------|
| `grafana-dashboards` | Dashboard JSON, queries, alerts | Monitoring setup |
| `release-automation` | Version bump, changelog, publish | Released package |
| `security-audit` | PII scan, auth check, report | Security report |

## 🔧 MCP Server Configuration

The `mcp.json` file configures all MCP servers for your IDE:

```json
{
  "mcpServers": {
    "tavily-mcp": { /* Tavily search tools */ },
    "stripe": { /* Payment processing */ },
    "cloudflare-observability": { /* Monitoring */ },
    "cloudflare-radar": { /* Security analytics */ },
    "cloudflare-browser": { /* Web browsing */ },
    "github": { /* Repository management */ },
    "agentql": { /* Web scraping */ },
    "alby": { /* Bitcoin Lightning */ },
    "netlify": { /* Deployment */ },
    "elevenlabs": { /* Text-to-speech */ }
  },
  "copilot": {
    "instructions": ".github/copilot-instructions.md",
    "prompts": ".github/prompts",
    "agents": ".github/agents",
    "skills": ".github/skills"
  }
}
```

## 💡 Usage Examples

### Example 1: Adding a New MCP Provider

```
User: "@mcp-integration-agent Help me add a Plaid MCP integration"

Agent will:
1. Research Plaid API documentation
2. Create src/config/plaid.config.ts with Zod schema
3. Implement src/plaid.ts with tool registration
4. Add tests in test_plaid_critical.mjs
5. Update README.md with setup instructions
6. Create TODO_PLAID.md tracking file
```

### Example 2: Setting Up Metrics

```
User: "Set up metrics for the new invoice module"

Copilot uses metrics-setup.prompt.md to:
1. Create invoice.metrics.ts with counters/histograms
2. Instrument InvoiceService methods
3. Update Alloy configuration
4. Document metrics in README
5. Verify compliance (no PII in labels)
```

### Example 3: Compliance Review

```
User: "@compliance-agent Review the payroll module for SOC 2"

Agent will check:
- PII masking in all logs
- Audit logging for financial operations
- Authentication on all endpoints
- Error handling without data exposure
- Maker/checker pattern implementation
```

### Example 4: Security Audit

```
User: "Run security audit skill before release"

Skill executes:
1. PII scan across all files
2. Authentication check on controllers
3. Input validation audit
4. Certificate handling review
5. Generate security report
```

## 🏗️ Architecture Patterns

### NestJS Module Pattern
```
feature/
├── feature.module.ts          # Module definition
├── services/
│   └── feature.service.ts     # Business logic
├── controllers/
│   └── feature.controller.ts   # HTTP handlers
├── dto/
│   └── create-feature.dto.ts   # Input validation
└── providers/
    └── feature.provider.ts     # Factory providers
```

### MCP Tool Pattern
```typescript
// src/provider.ts
export function registerProviderTools(server: Server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{ name: 'provider_action', description: '...', inputSchema: {...} }]
  }));
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Implementation with error handling
  });
}
```

### Metrics Pattern
```typescript
// Instrumentation in services
const end = metrics.operationDuration.startTimer({ operation: 'name' });
try {
  // ... logic
  metrics.operationsTotal.inc({ operation: 'name', status: 'success' });
} catch (error) {
  metrics.operationsTotal.inc({ operation: 'name', status: 'failure' });
  throw error;
} finally {
  end();
}
```

## 🔒 Compliance Requirements

### SOC 2 Controls
- **CC6.1**: Logical access controls (AuthGuard, role-based access)
- **CC7.2**: Security event monitoring (audit logging, error tracking)
- **CC9.2**: Financial transaction integrity (atomic operations, reconciliation)
- **A1.2**: Availability & traceability (timestamps, request IDs)

### PII Handling
- Account numbers: mask all but last 4 digits
- Routing numbers: mask all but last 4 digits
- Use `maskPaymentItem()` before logging
- Never log SSNs, tax IDs, or personal identifiers

### Audit Logging
Required fields for all financial operations:
- `actor`: User ID or system identifier
- `action`: Dot-notation action name (e.g., `payroll.run.create`)
- `resource_id`: Entity being modified
- `result`: success or failure
- `timestamp`: ISO 8601 format
- `request_id`: For distributed tracing

## 📊 Metrics Catalog

### HTTP Metrics (Auto-generated)
- `http_requests_total` - Counter with method, route, status_code
- `http_request_duration_seconds` - Histogram with method, route, status_code
- `http_errors_total` - Counter for 4xx/5xx responses

### Business Metrics
- `payroll_runs_created_total` - Payroll runs created
- `payroll_runs_approved_total` - Approved by checker
- `payroll_payments_total` - Individual payments by status
- `payroll_run_amount_usd` - Payment amount distribution
- `jpm_api_calls_total` - JPMorgan API calls by operation
- `jpm_api_duration_seconds` - JPMorgan API latency

## 🚀 Release Process

1. **Pre-release**: Run `deployment-checklist` prompt
2. **Testing**: Execute `test_critical_path.mjs`
3. **Version**: `npm version patch|minor|major`
4. **Changelog**: Update CHANGELOG.md
5. **Git**: `git push origin main --tags`
6. **Verify**: Check npm and GitHub releases

## 📝 TODO Tracking

Project uses multiple TODO files for tracking:
- `TODO.md` - Main project tracker
- `TODO_<FEATURE>.md` - Feature-specific trackers
- `TODO_PROGRESS.md` - Progress updates
- `TODO_COMMIT.md` - Commit planning

## 🎓 Learning Resources

### NestJS Reference Implementation
- `nestjs-reference/jpm/` - J.P. Morgan integration example
- `nestjs-reference/payroll/` - Payroll processing with maker/checker
- `nestjs-reference/metrics/` - Prometheus metrics setup
- `nestjs-reference/common/` - Shared utilities (PII masking, audit logging)

### MCP Server Examples
- `src/stripe.ts` - REST API with API key
- `src/github.ts` - REST API with token
- `src/jpmorgan.ts` - OAuth with mTLS
- `src/cloudflare.ts` - Multi-service provider

## 🔗 External Resources

- [Model Context Protocol](https://modelcontextprotocol.io)
- [NestJS Documentation](https://docs.nestjs.com)
- [Prometheus Best Practices](https://prometheus.io/docs/practices)
- [SOC 2 Compliance Guide](https://www.aicpa.org/soc)

## 🤝 Contributing

When adding new customizations:
1. Follow existing patterns in this guide
2. Update this guide with new examples
3. Test prompts and agents thoroughly
4. Document all new metrics and compliance requirements

---

**Last Updated**: 2025-01-15  
**Version**: 1.0.0  
**Maintainer**: Tavily MCP Team

