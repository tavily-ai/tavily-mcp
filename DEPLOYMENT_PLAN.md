# Deployment Plan

## Current Status: LIVE DEPLOYMENT READY ✅

## Version: 0.3.0

## Deployment Strategy

### 1. Local Development & Testing

- TypeScript source in `src/`
- Tests in `test_*.mjs` files
- Build artifacts in `build/`

### 2. Pre-Production Verification

- ✅ All 117 critical path tests pass
- ✅ TypeScript compiles without errors
- ✅ Build artifacts generated successfully

### 3. Release Process

1. **Version Bump**: `npm version minor` (0.2.x → 0.3.0)
2. **Build**: `npm run build` (compiles to `build/`)
3. **Test**: `node test_critical_path.mjs` (117 tests)
4. **Publish**: `npm publish --access public`

### 4. CI/CD Pipeline (GitHub Actions)

- **Trigger**: Push to `main` branch or new tags (`v*`)
- **Workflow**: `.github/workflows/release.yml`
- **Steps**:
  1. Checkout code
  2. Setup Node.js 20
  3. Install dependencies
  4. Run tests
  5. Build project
  6. Publish to npm (on tags only)

### 5. Distribution

- **npm Registry**: `@owlban/frog@0.3.0`
- **MCP Servers**: 10 integration servers configured in `mcp.json`
- **J.P. Morgan**: 4 service categories (Balances, Embedded, Payments, Payroll)

### 6. GitHub Repository Sync

- **owlban** (origin): Production ready, up to date
- **ESADavid** (upstream): PR awaiting merge

## Rollback Procedure

1. Revert version in `package.json`
2. Push new version tag: `git tag -d v0.3.0 && git push origin :refs/tags/v0.3.0`
3. Unpublish from npm: `npm unpublish @owlban/frog@0.3.0`

## Monitoring

- Check npm downloads: `npm view @owlban/frog`
- Check GitHub Actions: <https://github.com/OwlbanGroup/tavily-mcp/actions>

## Next Steps

1. Merge PR in ESADavid/tavily-mcp
2. Tag release: `git tag v0.3.0 && git push origin v0.3.0`
3. CI/CD will automatically publish to npm
