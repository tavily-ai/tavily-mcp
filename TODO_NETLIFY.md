# Netlify MCP Integration - TODO (ALL COMPLETED ✅)

## Tasks

- [x] 1. Create src/netlify.ts - Netlify MCP server config, listNetlifyTools, isNetlifyConfigured, getNetlifyConfig ✅
- [x] 2. Update src/index.ts - Add netlify imports, tool definitions, handlers, format functions ✅
- [x] 3. Update README.md - Add Netlify MCP Server section ✅
- [x] 4. Run npm run build - TypeScript compilation ✅
- [x] 5. Run critical-path tests - Verify integration (build passes, tools registered) ✅
- [x] 6. Commit and push changes ✅ (commit d89602f → cloudflare-mcp-integration)

## Details

### Netlify MCP Server (https://github.com/netlify/netlify-mcp)
- npm package: `@netlify/mcp`
- Command: `npx -y @netlify/mcp`
- Auth env var: `NETLIFY_PERSONAL_ACCESS_TOKEN` (optional PAT)
- Docs: https://docs.netlify.com/welcome/build-with-ai/netlify-mcp-server/

### Tool Domains (5 domains)

**Project tools:**
1. `get-project` - Get a Netlify project/site by ID or name
2. `get-projects` - List all Netlify projects/sites
3. `create-new-project` - Create a new Netlify project
4. `update-project-name` - Update a project name
5. `update-visitor-access-controls` - Modify access controls for a project
6. `update-project-forms` - Enable/disable form submissions for a project
7. `get-forms-for-project` - Get all forms for a project
8. `manage-form-submissions` - Manage form submissions
9. `manage-project-env-vars` - Create/update/delete environment variables

**Deploy tools:**
10. `get-deploy` - Get a deploy by ID
11. `get-deploy-for-site` - Get deploys for a site
12. `deploy-site` - Build and deploy a site
13. `deploy-site-remotely` - Deploy a site remotely

**User tools:**
14. `get-user` - Get current user information

**Team tools:**
15. `get-team` - Get team information

**Extension tools:**
16. `manage-extensions` - Install/uninstall Netlify extensions
