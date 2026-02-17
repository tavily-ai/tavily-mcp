# TODO: Stripe Integration for tavily-mcp

## Tasks
- [x] 1. Add stripe package to package.json dependencies
- [x] 2. Create src/stripe.ts - Stripe service with environment variable-based API key loading
- [x] 3. Update src/index.ts - Integrate Stripe service and add MCP tools
- [ ] 4. Update .env.example or README with STRIPE_SECRET_KEY environment variable instructions
- [ ] 5. Test the build

## Details

### 1. Add stripe package - COMPLETED
- Added "stripe" to dependencies in package.json

### 2. Create Stripe service (src/stripe.ts) - COMPLETED
- Load STRIPE_SECRET_KEY from environment variables
- Initialize Stripe client properly (ES module syntax)
- Export functions for:
  - Creating payment intents
  - Retrieving payment intents
  - Creating customers
  - Retrieving customers
  - Listing charges
  - Creating checkout sessions
  - Retrieving checkout sessions

### 3. Update MCP server (src/index.ts) - COMPLETED
- Import Stripe service
- Added new MCP tools:
  - stripe_create_payment_intent
  - stripe_get_payment_intent
  - stripe_create_customer
  - stripe_get_customer
  - stripe_list_charges
  - stripe_create_checkout_session
  - stripe_get_checkout_session
- Added format functions for Stripe responses
- API key is loaded from environment variable (security fix - no hardcoded keys)

### 4. Documentation - PENDING
- Add STRIPE_SECRET_KEY to .env.example or update README

### 5. Build Testing - PENDING
- Need to run npm install and npm run build to test
