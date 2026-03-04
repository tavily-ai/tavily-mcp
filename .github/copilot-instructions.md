# Copilot Instructions - Tavily MCP Server

## Project Overview
This is a multi-provider MCP (Model Context Protocol) server with enterprise-grade integrations including Stripe, Cloudflare, GitHub, AgentQL, Alby, Netlify, and J.P. Morgan. It includes a NestJS reference implementation with SOC 2 compliance, Prometheus metrics, and financial transaction processing capabilities.

## Coding Standards

### TypeScript/MCP Patterns
- Use ES modules (`"type": "module"` in package.json)
- Prefer async/await over raw promises
- Use strict TypeScript configuration with null checks enabled
- Export all MCP tools via `src/index.ts` with proper registration
- Follow the pattern: `server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...] }))`
- Use Zod or similar for runtime validation of tool arguments
- Always include JSDoc comments for tool descriptions

### NestJS Architecture (nestjs-reference/)
- Use modular architecture with `@Module()` decorators
- Implement services as `@Injectable()` classes
- Use constructor injection for dependencies
- Apply `@Global()` to shared modules (MetricsModule)
- Follow the pattern: Controller → Service → Client/Provider
- Use DTOs with `class-validator` decorators for input validation
- Implement interceptors for cross-cutting concerns (metrics, audit logging)

### Security & Compliance (SOC 2)
- **Never log raw PII**: Always use `maskPaymentItem()` from `common/utils/pii.util.ts`
- **Audit logging**: Use `AuditLoggerService` for all financial operations
- **Certificate handling**: Load certs from environment-configured paths only
- **mTLS**: Support both direct Node.js mTLS and gateway-terminated TLS
- **Encryption**: Use RSA-OAEP for payload encryption, RSA-SHA256 for signing
- **Environment separation**: Support `testing`/`production`/`mock` environments

### Prometheus Metrics Conventions
- Metric names: `snake_case` with module prefix (e.g., `payroll_runs_created_total`)
- Labels: Use `env`, `status`, `operation` consistently
- Metric types:
  - Counters: `_total` suffix for events
  - Histograms: `_duration_seconds` or `_amount_usd` for measurements
  - Gauges: Current state metrics
- Always include `method`, `route`, `status_code` for HTTP metrics
- Register metrics in module providers, expose via `MetricsController`

### File Organization
```
src/
  <provider>.ts              # Main MCP tool implementations
  <provider>/
    index.ts                 # Re-exports
    <feature>.ts             # Sub-feature implementations
  config/
    <provider>.config.ts     # Configuration schemas
  payroll/
    models/                  # Data models
    services/                # Business logic
nestjs-reference/
  jpm/                       # J.P. Morgan module
    services/                # Signing, encryption, HTTP clients
    controllers/             # REST endpoints
    providers/               # Factory providers
  payroll/                   # Payroll processing module
  metrics/                   # Prometheus metrics module
  common/                    # Shared utilities
    interceptors/            # HTTP metrics, audit logging
    filters/                 # Exception handling
    logger/                  # Audit logger
    utils/                   # PII masking, helpers
```

### Environment Variables
Required patterns:
- API keys: `<PROVIDER>_API_KEY` or `<PROVIDER>_ACCESS_TOKEN`
- Environment: `<PROVIDER>_ENV` (testing/production/mock)
- Certificates: `<CERT_TYPE>_PATH` with sensible defaults
- OAuth: `<PROVIDER>_CLIENT_ID`, `<PROVIDER>_CLIENT_SECRET`, `<PROVIDER>_TOKEN_URL`

### Testing Patterns
- Create `test_<feature>_critical.mjs` for integration tests
- Use `nestjs-test/` for DI wiring and unit tests with Jest
- Mock external APIs in `nestjs-test/mocks/`
- Always test error paths and certificate handling

### Documentation Requirements
- Update `README.md` when adding new MCP servers
- Create `TODO_<FEATURE>.md` for tracking implementation progress
- Include setup instructions with environment variable examples
- Document metric names and labels in module READMEs

### Error Handling
- Use `AllExceptionsFilter` for global error handling in NestJS
- Return structured error responses with `error_code` and `message`
- Log errors with context using `AuditLoggerService`
- Never expose stack traces or sensitive data in error responses

### Git Workflow
- Use conventional commits: `feat:`, `fix:`, `docs:`, `security:`
- Update `TODO.md` and related tracking files before committing
- Run `test_critical_path.mjs` before major releases
- Follow the release workflow in `.github/workflows/release.yml`

