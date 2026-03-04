# Release Automation Skill

## Description
Automate the release process for the Tavily MCP server including versioning, changelog generation, and deployment.

## When to Use
- Preparing a new release
- Version bumping
- Changelog updates
- Deployment to production

## Prerequisites
- All tests passing (`test_critical_path.mjs`)
- TODO items completed
- GitHub Actions workflow configured
- npm authentication (for publishing)

## Steps

### 1. Pre-Release Checklist
Run through `DEPLOYMENT_CHECKLIST.md`:
```bash
# Run critical path tests
node test_critical_path.mjs

# Run NestJS tests
cd nestjs-test && npm test && cd ..

# Check all TODOs are resolved
grep -r "\[ \]" TODO*.md || echo "All TODOs complete"
```

### 2. Version Bump
```bash
# Determine version type (patch/minor/major)
npm version patch  # or minor, major

# This updates:
# - package.json version
# - package-lock.json
# - Creates git tag
```

### 3. Changelog Update
```markdown
# CHANGELOG.md

## [X.Y.Z] - YYYY-MM-DD

### Added
- New feature description

### Changed
- Modified behavior description

### Fixed
- Bug fix description

### Security
- Security-related changes
```

### 4. GitHub Release
```bash
# Push version bump and tag
git push origin main --tags

# GitHub Actions will:
# - Run tests
# - Build package
# - Publish to npm
# - Create GitHub release
```

### 5. Post-Release Verification
```bash
# Verify npm package
npm view tavily-mcp@latest version

# Test installation
npx -y tavily-mcp@latest --version

# Verify GitHub release
curl -s https://api.github.com/repos/tavily-ai/tavily-mcp/releases/latest | jq '.tag_name'
```

## GitHub Actions Workflow

The release workflow (`.github/workflows/release.yml`) should include:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: node test_critical_path.mjs
      - run: cd nestjs-test && npm ci && npm test

  publish:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  release:
    needs: publish
    runs-on: ubuntu-latest
    steps:
      - uses: actions/create-release@v1
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          body_path: CHANGELOG.md
```

## Conventional Commits

Use these prefixes for automatic changelog generation:

- `feat:` - New features (minor version bump)
- `fix:` - Bug fixes (patch version bump)
- `docs:` - Documentation only
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `test:` - Test changes
- `chore:` - Build/process changes
- `security:` - Security fixes

Example:
```bash
git commit -m "feat: add Cloudflare Radar MCP tools"
git commit -m "fix: handle JPMorgan API rate limits"
git commit -m "security: update dependencies for CVE-2024-XXXX"
```

## Release Types

### Patch Release (0.0.X)
- Bug fixes
- Security patches
- Documentation updates
- Performance improvements

### Minor Release (0.X.0)
- New features
- New MCP providers
- New NestJS modules
- Non-breaking changes

### Major Release (X.0.0)
- Breaking API changes
- Major architecture changes
- Deprecation removals

## Rollback Procedure

If a release has issues:

```bash
# Deprecate npm version
npm deprecate tavily-mcp@X.Y.Z "Critical issue found, use X.Y.Z-1 instead"

# Revert git tag
git push --delete origin vX.Y.Z
git tag --delete vX.Y.Z

# Fix issues and release new version
npm version patch
git push origin main --tags
```

## Monitoring After Release

Check these metrics post-release:
- npm download statistics
- GitHub issue reports
- Error rates in production
- MCP server health checks

## Output
- Updated version in package.json
- Git tag pushed
- GitHub release created
- npm package published
- CHANGELOG.md updated

## References
- `.github/workflows/release.yml` - Release workflow
- `DEPLOYMENT_CHECKLIST.md` - Pre-release checklist
- `test_critical_path.mjs` - Critical path tests

