## Final Release Workflow v0.4.0

### 1. Merge PR #2

- Go to <https://github.com/ESADavid/tavily-mcp/pull/2>
- Click 'Merge pull request' → 'Create a merge commit'
- Confirm merge

### 2. Local Sync

```powershell
git checkout main
git pull origin main
```

### 3. Create Tag

```powershell
git tag -a v0.4.0 -m \"Release v0.4.0 – Cloudflare/Alby/Netlify/AgentQL/JPMorgan integrations + Payroll + NestJS SOC2\"
```

### 4. Push Tag (Triggers GitHub Actions)

```powershell
git push origin v0.4.0
```

### 5. Verify

- GitHub Releases: v0.4.0 published
- npm: @owlban/frog@0.4.0 available
- Actions: release workflow green

**Status: READY FOR MANUAL MERGE → AUTO-RELEASE**

**Changes included:**

- 48 commits, 104 files
- All MCP integrations complete
- 117/117 tests passing
- Production ready
