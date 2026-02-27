# Signing Service Integration TODO

## Steps

- [x] Step 1: Create `src/signing.service.ts` — RSA-SHA256 signing + RSA encryption + callback verification
- [x] Step 2: Create `src/mtls.service.ts` — Mutual TLS https.Agent factory (matches JPM integration guide pattern exactly)
- [x] Step 3: Modify `src/jpmorgan.ts` — sign → encrypt → mTLS pipeline in `retrieveBalances()`
- [x] Step 4: Modify `src/jpmorgan_embedded.ts` — sign → encrypt → mTLS pipeline in all 5 API functions
- [x] Step 5: Add `test_signing_critical.mjs` — 41 tests across 10 suites (all passing)
- [x] Step 6: `npm run build` — TypeScript compiles with zero errors
- [x] Step 7: Align `createMtlsAgent()` to exact JPM pattern: `new https.Agent({ cert, key, ca })`
