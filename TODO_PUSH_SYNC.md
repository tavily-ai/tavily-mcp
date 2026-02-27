# Push Sync TODO

## Steps
- [x] 1. Squash all commits since bbf4c2c into one clean commit (94fdab5)
  - ✅ Removed hardcoded secrets from test_live_api.mjs
  - ✅ All integrations, NestJS refactor, markdownlint fixes included
- [x] 2. Push to owlban/cloudflare-mcp-integration
  - ✅ bbf4c2c..94fdab5 pushed successfully
- [ ] 3. Push to origin/cloudflare-mcp-integration (ESADavid)
  - ❌ BLOCKED: 403 — current credentials are OwlbanGroup, not ESADavid
- [ ] 4. Open PR: cloudflare-mcp-integration → main on ESADavid/tavily-mcp
- [ ] 5. Merge PR and bump version (0.2.17 → 0.3.0)
- [ ] 6. npm publish

## Summary

| Remote | URL | Status |
|--------|-----|--------|
| owlban | https://github.com/OwlbanGroup/tavily-mcp.git | ✅ Up to date (94fdab5) |
| origin | https://github.com/ESADavid/tavily-mcp.git   | ❌ Push blocked (403) — needs ESADavid credentials |
| upstream | https://github.com/tavily-ai/tavily-mcp.git | (read-only reference) |

## Resolution — Push to origin

Authenticate as ESADavid, then run:

```bash
git remote set-url origin https://ESADavid@github.com/ESADavid/tavily-mcp.git
git push origin cloudflare-mcp-integration --force
```

## Resolution — Open PR (after push)

```bash
gh pr create --repo ESADavid/tavily-mcp --base main --head cloudflare-mcp-integration \
  --title "feat: Cloudflare/Alby/Netlify/AgentQL/JPMorgan Embedded Payments + NestJS JpmHttpService" \
  --body "Adds 7 Embedded Payments tools, JpmHttpService injectable, Cloudflare/Alby/Netlify/AgentQL integrations. 67/67 tests passing. No hardcoded secrets."
```

## Resolution — npm publish (after merge to main)

```bash
npm version minor   # 0.2.17 → 0.3.0
npm run build
npm publish --access public
git tag v0.3.0
git push origin v0.3.0
```
