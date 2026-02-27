/**
 * Live API tests — requires real API keys in .env
 * Run: node test_live_api.mjs
 *
 * Only tests services whose API keys are present in the environment.
 */

import { config } from 'dotenv';
config();

let passed = 0;
let failed = 0;
let skipped = 0;

function test(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ FAIL: ${name}`);
      console.log(`         ${err.message}`);
      failed++;
    }
  };
}

function skip(name, reason) {
  console.log(`  ⏭️  SKIP: ${name} — ${reason}`);
  skipped++;
}

// ─── TAVILY LIVE TESTS ────────────────────────────────────────────────────────
console.log('\n=== TAVILY LIVE API TESTS ===\n');

if (!process.env.TAVILY_API_KEY) {
  skip('tavily_search', 'TAVILY_API_KEY not set');
  skip('tavily_extract', 'TAVILY_API_KEY not set');
} else {
  await test('tavily_search — basic query', async () => {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`
      },
      body: JSON.stringify({ query: 'What is the capital of France?', max_results: 3 })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!data.results || data.results.length === 0) throw new Error('No results returned');
    console.log(`         → Got ${data.results.length} results. First: "${data.results[0].title}"`);
  })();

  await test('tavily_extract — extract a URL', async () => {
    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`
      },
      body: JSON.stringify({ urls: ['https://example.com'] })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!data.results || data.results.length === 0) throw new Error('No results returned');
    console.log(`         → Extracted ${data.results.length} URL(s)`);
  })();
}

// ─── STRIPE LIVE TESTS ────────────────────────────────────────────────────────
console.log('\n=== STRIPE LIVE API TESTS ===\n');

if (!process.env.STRIPE_SECRET_KEY) {
  skip('stripe_list_charges', 'STRIPE_SECRET_KEY not set');
} else {
  await test('stripe_list_charges — list charges', async () => {
    const res = await fetch('https://api.stripe.com/v1/charges?limit=3', {
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    console.log(`         → Got ${data.data.length} charge(s)`);
  })();
}

// ─── AGENTQL LIVE TESTS ───────────────────────────────────────────────────────
console.log('\n=== AGENTQL LIVE API TESTS ===\n');

if (!process.env.AGENTQL_API_KEY) {
  skip('agentql_query_data', 'AGENTQL_API_KEY not set');
} else {
  await test('agentql_query_data — query example.com', async () => {
    const res = await fetch('https://api.agentql.com/v1/query-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.AGENTQL_API_KEY
      },
      body: JSON.stringify({
        url: 'https://example.com',
        query: '{ heading }',
        params: { wait_for: 0, mode: 'fast' }
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    console.log(`         → Response keys: ${Object.keys(data).join(', ')}`);
  })();
}

// ─── GITHUB LIVE TESTS ────────────────────────────────────────────────────────
console.log('\n=== GITHUB LIVE API TESTS ===\n');

if (!process.env.GITHUB_TOKEN) {
  skip('github_user', 'GITHUB_TOKEN not set');
} else {
  await test('github — get authenticated user', async () => {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    console.log(`         → Authenticated as: ${data.login}`);
  })();
}

// ─── ELEVENLABS LIVE TESTS ────────────────────────────────────────────────────
console.log('\n=== ELEVENLABS LIVE API TESTS ===\n');

if (!process.env.ELEVENLABS_API_KEY) {
  skip('elevenlabs_voices', 'ELEVENLABS_API_KEY not set');
} else {
  await test('elevenlabs — list voices', async () => {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    console.log(`         → Got ${data.voices?.length ?? 0} voice(s)`);
  })();
}

// ─── CLOUDFLARE LIVE TESTS ────────────────────────────────────────────────────
console.log('\n=== CLOUDFLARE LIVE API TESTS ===\n');

if (!process.env.CLOUDFLARE_API_TOKEN) {
  skip('cloudflare_verify_token', 'CLOUDFLARE_API_TOKEN not set');
} else {
  await test('cloudflare — verify token', async () => {
    const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: {
        'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!data.success) throw new Error(`Token invalid: ${JSON.stringify(data.errors)}`);
    console.log(`         → Token status: ${data.result?.status}`);
  })();
}

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
console.log('\n=== LIVE API TEST SUMMARY ===\n');
console.log(`  Total:   ${passed + failed + skipped}`);
console.log(`  Passed:  ${passed}`);
console.log(`  Failed:  ${failed}`);
console.log(`  Skipped: ${skipped} (API key not set)`);
console.log('');

if (failed > 0) {
  console.log('❌ Some live API tests failed!');
  process.exit(1);
} else if (passed === 0) {
  console.log('⏭️  No live tests ran — please fill in API keys in .env');
  process.exit(0);
} else {
  console.log('✅ All live API tests passed!');
  process.exit(0);
}
