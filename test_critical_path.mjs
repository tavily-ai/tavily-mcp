/**
 * Critical-path tests for Alby and AgentQL integrations
 * Tests format functions and tool handler logic using the compiled build
 */

import { listAlbyServers, isAlbyConfigured, getAlbyConfig, ALBY_MCP_SERVER } from './build/alby.js';
import { listAgentQLServers, isAgentQLConfigured, getAgentQLConfig, AGENTQL_MCP_SERVER } from './build/agentql.js';
import { listCloudflareServers, CLOUDFLARE_MCP_SERVERS } from './build/cloudflare.js';
import { listNetlifyTools, isNetlifyConfigured, getNetlifyConfig, NETLIFY_MCP_SERVER } from './build/netlify.js';
import { JPMORGAN_API_SERVER, listJPMorganTools, isJPMorganConfigured, getJPMorganConfig, retrieveBalances as jpmRetrieveBalances } from './build/jpmorgan.js';
import { JPMORGAN_EMBEDDED_SERVER, listJPMorganEmbeddedTools, isJPMorganEmbeddedConfigured, getJPMorganEmbeddedConfig, listClients as efListClients, getClient as efGetClient, createClient as efCreateClient } from './build/jpmorgan_embedded.js';

let passed = 0;
let failed = 0;
const asyncQueue = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ FAIL: ${name}`);
    console.log(`         ${err.message}`);
    failed++;
  }
}

// Async test — queued and run before summary
function asyncTest(name, fn) {
  asyncQueue.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'assertEqual failed'}: expected "${expected}", got "${actual}"`);
  }
}

function assertIncludes(str, substr, message) {
  if (!str.includes(substr)) {
    throw new Error(`${message || 'assertIncludes failed'}: "${substr}" not found in output`);
  }
}

// ─── ALBY TESTS ───────────────────────────────────────────────────────────────
console.log('\n=== ALBY INTEGRATION TESTS ===\n');

test('ALBY_MCP_SERVER has correct npm package', () => {
  assertEqual(ALBY_MCP_SERVER.npmPackage, '@getalby/mcp', 'npm package name');
});

test('ALBY_MCP_SERVER has correct remote URLs', () => {
  assertEqual(ALBY_MCP_SERVER.remoteUrls.httpStreamable, 'https://mcp.getalby.com/mcp', 'HTTP Streamable URL');
  assertEqual(ALBY_MCP_SERVER.remoteUrls.sse, 'https://mcp.getalby.com/sse', 'SSE URL');
});

test('listAlbyServers returns 11 tools', () => {
  const servers = listAlbyServers();
  assertEqual(servers.length, 11, 'tool count');
});

test('listAlbyServers contains all NWC tools', () => {
  const servers = listAlbyServers();
  const names = servers.map(s => s.name);
  const nwcTools = ['get_balance', 'get_info', 'get_wallet_service_info', 'lookup_invoice', 'make_invoice', 'pay_invoice', 'list_transactions'];
  for (const tool of nwcTools) {
    assert(names.includes(tool), `Missing NWC tool: ${tool}`);
  }
});

test('listAlbyServers contains all Lightning tools', () => {
  const servers = listAlbyServers();
  const names = servers.map(s => s.name);
  const lightningTools = ['fetch_l402', 'fiat_to_sats', 'parse_invoice', 'request_invoice'];
  for (const tool of lightningTools) {
    assert(names.includes(tool), `Missing Lightning tool: ${tool}`);
  }
});

test('isAlbyConfigured returns false when NWC_CONNECTION_STRING not set', () => {
  delete process.env.NWC_CONNECTION_STRING;
  assertEqual(isAlbyConfigured(), false, 'should be false without env var');
});

test('isAlbyConfigured returns true when NWC_CONNECTION_STRING is set', () => {
  process.env.NWC_CONNECTION_STRING = 'nostr+walletconnect://test';
  assertEqual(isAlbyConfigured(), true, 'should be true with env var');
  delete process.env.NWC_CONNECTION_STRING;
});

test('getAlbyConfig returns configured=false without env var', () => {
  delete process.env.NWC_CONNECTION_STRING;
  const config = getAlbyConfig();
  assertEqual(config.configured, false, 'configured should be false');
  assertEqual(config.npmPackage, '@getalby/mcp', 'npm package');
});

test('getAlbyConfig returns configured=true with env var', () => {
  process.env.NWC_CONNECTION_STRING = 'nostr+walletconnect://test';
  const config = getAlbyConfig();
  assertEqual(config.configured, true, 'configured should be true');
  delete process.env.NWC_CONNECTION_STRING;
});

// ─── AGENTQL TESTS ────────────────────────────────────────────────────────────
console.log('\n=== AGENTQL INTEGRATION TESTS ===\n');

test('AGENTQL_MCP_SERVER has correct npm package', () => {
  assertEqual(AGENTQL_MCP_SERVER.npmPackage, 'agentql-mcp', 'npm package name');
});

test('AGENTQL_MCP_SERVER has correct API base URL', () => {
  assertEqual(AGENTQL_MCP_SERVER.apiBaseUrl, 'https://api.agentql.com/v1', 'API base URL');
});

test('listAgentQLServers returns 2 tools', () => {
  const servers = listAgentQLServers();
  assertEqual(servers.length, 2, 'tool count');
});

test('listAgentQLServers contains query_data tool', () => {
  const servers = listAgentQLServers();
  const tool = servers.find(s => s.name === 'query_data');
  assert(tool !== undefined, 'query_data tool not found');
  assertIncludes(tool.description, 'AgentQL', 'description should mention AgentQL');
});

test('listAgentQLServers contains get_web_element tool', () => {
  const servers = listAgentQLServers();
  const tool = servers.find(s => s.name === 'get_web_element');
  assert(tool !== undefined, 'get_web_element tool not found');
});

test('isAgentQLConfigured returns false when AGENTQL_API_KEY not set', () => {
  delete process.env.AGENTQL_API_KEY;
  assertEqual(isAgentQLConfigured(), false, 'should be false without env var');
});

test('isAgentQLConfigured returns true when AGENTQL_API_KEY is set', () => {
  process.env.AGENTQL_API_KEY = 'test-key-123';
  assertEqual(isAgentQLConfigured(), true, 'should be true with env var');
  delete process.env.AGENTQL_API_KEY;
});

test('getAgentQLConfig returns correct command', () => {
  const config = getAgentQLConfig();
  assertEqual(config.command, 'npx', 'command should be npx');
  assert(config.args.includes('agentql-mcp'), 'args should include agentql-mcp');
});

// ─── CLOUDFLARE TESTS ─────────────────────────────────────────────────────────
console.log('\n=== CLOUDFLARE INTEGRATION TESTS ===\n');

test('CLOUDFLARE_MCP_SERVERS has observability URL', () => {
  assertIncludes(CLOUDFLARE_MCP_SERVERS.observability, 'observability.mcp.cloudflare.com', 'observability URL');
});

test('CLOUDFLARE_MCP_SERVERS has radar URL', () => {
  assertIncludes(CLOUDFLARE_MCP_SERVERS.radar, 'radar.mcp.cloudflare.com', 'radar URL');
});

test('CLOUDFLARE_MCP_SERVERS has browser URL', () => {
  assertIncludes(CLOUDFLARE_MCP_SERVERS.browser, 'browser.mcp.cloudflare.com', 'browser URL');
});

test('listCloudflareServers returns 3 servers', () => {
  const servers = listCloudflareServers();
  assertEqual(servers.length, 3, 'server count');
});

test('listCloudflareServers contains observability, radar, browser', () => {
  const servers = listCloudflareServers();
  const names = servers.map(s => s.name.toLowerCase());
  assert(names.some(n => n.includes('observability')), 'missing observability');
  assert(names.some(n => n.includes('radar')), 'missing radar');
  assert(names.some(n => n.includes('browser')), 'missing browser');
});

// ─── NETLIFY TESTS ────────────────────────────────────────────────────────────
console.log('\n=== NETLIFY INTEGRATION TESTS ===\n');

test('NETLIFY_MCP_SERVER has correct npm package', () => {
  assertEqual(NETLIFY_MCP_SERVER.npmPackage, '@netlify/mcp', 'npm package name');
});

test('NETLIFY_MCP_SERVER has correct command', () => {
  assertEqual(NETLIFY_MCP_SERVER.command, 'npx', 'command should be npx');
});

test('NETLIFY_MCP_SERVER args include @netlify/mcp', () => {
  assert(NETLIFY_MCP_SERVER.args.includes('@netlify/mcp'), 'args should include @netlify/mcp');
});

test('listNetlifyTools returns 16 tools', () => {
  const tools = listNetlifyTools();
  assertEqual(tools.length, 16, 'tool count');
});

test('listNetlifyTools contains all 5 domains', () => {
  const tools = listNetlifyTools();
  const domains = [...new Set(tools.map(t => t.domain))];
  assertEqual(domains.length, 5, 'domain count');
  assert(domains.includes('project'), 'missing project domain');
  assert(domains.includes('deploy'), 'missing deploy domain');
  assert(domains.includes('user'), 'missing user domain');
  assert(domains.includes('team'), 'missing team domain');
  assert(domains.includes('extension'), 'missing extension domain');
});

test('listNetlifyTools contains 9 project tools', () => {
  const tools = listNetlifyTools();
  const projectTools = tools.filter(t => t.domain === 'project');
  assertEqual(projectTools.length, 9, 'project tool count');
});

test('listNetlifyTools contains 4 deploy tools', () => {
  const tools = listNetlifyTools();
  const deployTools = tools.filter(t => t.domain === 'deploy');
  assertEqual(deployTools.length, 4, 'deploy tool count');
});

test('listNetlifyTools contains deploy-site tool', () => {
  const tools = listNetlifyTools();
  const tool = tools.find(t => t.name === 'deploy-site');
  assert(tool !== undefined, 'deploy-site tool not found');
  assertIncludes(tool.description, 'deploy', 'description should mention deploy');
});

test('listNetlifyTools contains manage-project-env-vars tool', () => {
  const tools = listNetlifyTools();
  const tool = tools.find(t => t.name === 'manage-project-env-vars');
  assert(tool !== undefined, 'manage-project-env-vars tool not found');
});

test('isNetlifyConfigured returns false when NETLIFY_PERSONAL_ACCESS_TOKEN not set', () => {
  delete process.env.NETLIFY_PERSONAL_ACCESS_TOKEN;
  assertEqual(isNetlifyConfigured(), false, 'should be false without env var');
});

test('isNetlifyConfigured returns true when NETLIFY_PERSONAL_ACCESS_TOKEN is set', () => {
  process.env.NETLIFY_PERSONAL_ACCESS_TOKEN = 'test-netlify-pat';
  assertEqual(isNetlifyConfigured(), true, 'should be true with env var');
  delete process.env.NETLIFY_PERSONAL_ACCESS_TOKEN;
});

test('getNetlifyConfig returns configured=false without env var', () => {
  delete process.env.NETLIFY_PERSONAL_ACCESS_TOKEN;
  const config = getNetlifyConfig();
  assertEqual(config.configured, false, 'configured should be false');
  assertEqual(config.npmPackage, '@netlify/mcp', 'npm package');
});

test('getNetlifyConfig returns configured=true with env var', () => {
  process.env.NETLIFY_PERSONAL_ACCESS_TOKEN = 'test-netlify-pat';
  const config = getNetlifyConfig();
  assertEqual(config.configured, true, 'configured should be true');
  delete process.env.NETLIFY_PERSONAL_ACCESS_TOKEN;
});

test('each Netlify tool has name, description, and domain', () => {
  const tools = listNetlifyTools();
  for (const tool of tools) {
    assert(typeof tool.name === 'string' && tool.name.length > 0, `tool missing name: ${JSON.stringify(tool)}`);
    assert(typeof tool.description === 'string' && tool.description.length > 0, `tool missing description: ${tool.name}`);
    assert(typeof tool.domain === 'string' && tool.domain.length > 0, `tool missing domain: ${tool.name}`);
  }
});

// ─── J.P. MORGAN TESTS ────────────────────────────────────────────────────────
console.log('\n=== J.P. MORGAN INTEGRATION TESTS ===\n');

test('JPMORGAN_API_SERVER has correct title', () => {
  assertIncludes(JPMORGAN_API_SERVER.title, 'J.P. Morgan', 'title should mention J.P. Morgan');
});

test('JPMORGAN_API_SERVER has correct version', () => {
  assertEqual(JPMORGAN_API_SERVER.version, '1.0.5', 'API version');
});

test('JPMORGAN_API_SERVER has correct endpoint', () => {
  assertEqual(JPMORGAN_API_SERVER.endpoint, '/balance', 'endpoint should be /balance');
});

test('JPMORGAN_API_SERVER has all 4 base URLs', () => {
  assertIncludes(JPMORGAN_API_SERVER.baseUrls.productionOAuth, 'openbanking.jpmorgan.com', 'production OAuth URL');
  assertIncludes(JPMORGAN_API_SERVER.baseUrls.productionMTLS, 'apigateway.jpmorgan.com', 'production MTLS URL');
  assertIncludes(JPMORGAN_API_SERVER.baseUrls.testingOAuth, 'openbankinguat.jpmorgan.com', 'testing OAuth URL');
  assertIncludes(JPMORGAN_API_SERVER.baseUrls.testingMTLS, 'apigatewayqaf.jpmorgan.com', 'testing MTLS URL');
});

test('listJPMorganTools returns 1 tool', () => {
  const tools = listJPMorganTools();
  assertEqual(tools.length, 1, 'tool count');
});

test('listJPMorganTools contains retrieve_balances tool', () => {
  const tools = listJPMorganTools();
  const tool = tools.find(t => t.name === 'retrieve_balances');
  assert(tool !== undefined, 'retrieve_balances tool not found');
  assertIncludes(tool.description, 'balance', 'description should mention balance');
});

test('isJPMorganConfigured returns false when JPMORGAN_ACCESS_TOKEN not set', () => {
  delete process.env.JPMORGAN_ACCESS_TOKEN;
  assertEqual(isJPMorganConfigured(), false, 'should be false without env var');
});

test('isJPMorganConfigured returns true when JPMORGAN_ACCESS_TOKEN is set', () => {
  process.env.JPMORGAN_ACCESS_TOKEN = 'test-bearer-token';
  assertEqual(isJPMorganConfigured(), true, 'should be true with env var');
  delete process.env.JPMORGAN_ACCESS_TOKEN;
});

test('getJPMorganConfig returns configured=false without env var', () => {
  delete process.env.JPMORGAN_ACCESS_TOKEN;
  const config = getJPMorganConfig();
  assertEqual(config.configured, false, 'configured should be false');
  assertEqual(config.activeEnv, 'testing', 'default env should be testing');
});

test('getJPMorganConfig returns configured=true with env var', () => {
  process.env.JPMORGAN_ACCESS_TOKEN = 'test-bearer-token';
  const config = getJPMorganConfig();
  assertEqual(config.configured, true, 'configured should be true');
  assertIncludes(config.activeBaseUrl, 'jpmorgan.com', 'activeBaseUrl should contain jpmorgan.com');
  delete process.env.JPMORGAN_ACCESS_TOKEN;
});

test('getJPMorganConfig uses testing OAuth URL by default', () => {
  delete process.env.JPMORGAN_ENV;
  const config = getJPMorganConfig();
  assertIncludes(config.activeBaseUrl, 'openbankinguat.jpmorgan.com', 'default should be testing OAuth URL');
});

// ─── J.P. MORGAN EMBEDDED PAYMENTS TESTS ─────────────────────────────────────
console.log('\n=== J.P. MORGAN EMBEDDED PAYMENTS TESTS ===\n');

test('JPMORGAN_EMBEDDED_SERVER has correct title', () => {
  assertIncludes(JPMORGAN_EMBEDDED_SERVER.title, 'Embedded Payments', 'title should mention Embedded Payments');
});

test('JPMORGAN_EMBEDDED_SERVER has correct version', () => {
  assertEqual(JPMORGAN_EMBEDDED_SERVER.version, 'v1', 'API version');
});

test('JPMORGAN_EMBEDDED_SERVER has production and mock base URLs', () => {
  assertIncludes(JPMORGAN_EMBEDDED_SERVER.baseUrls.production, 'apigateway.jpmorgan.com', 'production URL');
  assertIncludes(JPMORGAN_EMBEDDED_SERVER.baseUrls.mock, 'api-mock.payments.jpmorgan.com', 'mock URL');
});

test('JPMORGAN_EMBEDDED_SERVER has correct resources', () => {
  assertEqual(JPMORGAN_EMBEDDED_SERVER.resources.clients, '/clients', 'clients resource path');
  assertIncludes(JPMORGAN_EMBEDDED_SERVER.resources.accounts, '/accounts', 'accounts resource path');
});

test('listJPMorganEmbeddedTools returns 5 tools', () => {
  const tools = listJPMorganEmbeddedTools();
  assertEqual(tools.length, 5, 'tool count');
});

test('listJPMorganEmbeddedTools contains all client tools', () => {
  const tools = listJPMorganEmbeddedTools();
  const names = tools.map(t => t.name);
  assert(names.includes('ef_list_clients'), 'missing ef_list_clients');
  assert(names.includes('ef_get_client'), 'missing ef_get_client');
  assert(names.includes('ef_create_client'), 'missing ef_create_client');
});

test('listJPMorganEmbeddedTools contains all account tools', () => {
  const tools = listJPMorganEmbeddedTools();
  const names = tools.map(t => t.name);
  assert(names.includes('ef_list_accounts'), 'missing ef_list_accounts');
  assert(names.includes('ef_get_account'), 'missing ef_get_account');
});

test('each Embedded Payments tool has name, description, and resource', () => {
  const tools = listJPMorganEmbeddedTools();
  for (const tool of tools) {
    assert(typeof tool.name === 'string' && tool.name.length > 0, `tool missing name`);
    assert(typeof tool.description === 'string' && tool.description.length > 0, `tool missing description: ${tool.name}`);
    assert(typeof tool.resource === 'string' && tool.resource.length > 0, `tool missing resource: ${tool.name}`);
  }
});

test('isJPMorganEmbeddedConfigured returns false when JPMORGAN_ACCESS_TOKEN not set', () => {
  delete process.env.JPMORGAN_ACCESS_TOKEN;
  assertEqual(isJPMorganEmbeddedConfigured(), false, 'should be false without env var');
});

test('isJPMorganEmbeddedConfigured returns true when JPMORGAN_ACCESS_TOKEN is set', () => {
  process.env.JPMORGAN_ACCESS_TOKEN = 'test-bearer-token';
  assertEqual(isJPMorganEmbeddedConfigured(), true, 'should be true with env var');
  delete process.env.JPMORGAN_ACCESS_TOKEN;
});

test('getJPMorganEmbeddedConfig returns configured=false without env var', () => {
  delete process.env.JPMORGAN_ACCESS_TOKEN;
  const config = getJPMorganEmbeddedConfig();
  assertEqual(config.configured, false, 'configured should be false');
  assertEqual(config.activeEnv, 'production', 'default env should be production');
});

test('getJPMorganEmbeddedConfig returns configured=true with env var', () => {
  process.env.JPMORGAN_ACCESS_TOKEN = 'test-bearer-token';
  const config = getJPMorganEmbeddedConfig();
  assertEqual(config.configured, true, 'configured should be true');
  assertIncludes(config.activeBaseUrl, 'jpmorgan.com', 'activeBaseUrl should contain jpmorgan.com');
  delete process.env.JPMORGAN_ACCESS_TOKEN;
});

test('getJPMorganEmbeddedConfig uses production URL by default', () => {
  delete process.env.JPMORGAN_PAYMENTS_ENV;
  const config = getJPMorganEmbeddedConfig();
  assertIncludes(config.activeBaseUrl, 'apigateway.jpmorgan.com', 'default should be production URL');
});

test('getJPMorganEmbeddedConfig uses mock URL when JPMORGAN_PAYMENTS_ENV=mock', () => {
  process.env.JPMORGAN_PAYMENTS_ENV = 'mock';
  const config = getJPMorganEmbeddedConfig();
  assertIncludes(config.activeBaseUrl, 'api-mock.payments.jpmorgan.com', 'mock env should use mock URL');
  delete process.env.JPMORGAN_PAYMENTS_ENV;
});

asyncTest('efListClients throws when JPMORGAN_ACCESS_TOKEN not set', async () => {
  delete process.env.JPMORGAN_ACCESS_TOKEN;
  let threw = false;
  try {
    await efListClients();
  } catch (err) {
    threw = true;
    assertIncludes(err.message, 'JPMORGAN_ACCESS_TOKEN', 'error should mention JPMORGAN_ACCESS_TOKEN');
  }
  assert(threw, 'should have thrown when token not set');
});

asyncTest('efGetClient throws when clientId is empty', async () => {
  process.env.JPMORGAN_ACCESS_TOKEN = 'test-token';
  let threw = false;
  try {
    await efGetClient('');
  } catch (err) {
    threw = true;
    assertIncludes(err.message, 'clientId', 'error should mention clientId');
  }
  assert(threw, 'should have thrown for empty clientId');
  delete process.env.JPMORGAN_ACCESS_TOKEN;
});

asyncTest('efCreateClient throws when name is missing', async () => {
  process.env.JPMORGAN_ACCESS_TOKEN = 'test-token';
  let threw = false;
  try {
    await efCreateClient({ name: '' });
  } catch (err) {
    threw = true;
    assertIncludes(err.message, 'name', 'error should mention name');
  }
  assert(threw, 'should have thrown for missing name');
  delete process.env.JPMORGAN_ACCESS_TOKEN;
});

asyncTest('retrieveBalances throws when JPMORGAN_ACCESS_TOKEN not set', async () => {
  delete process.env.JPMORGAN_ACCESS_TOKEN;
  let threw = false;
  try {
    await jpmRetrieveBalances({ accountList: [{ accountId: '123' }] });
  } catch (err) {
    threw = true;
    assertIncludes(err.message, 'JPMORGAN_ACCESS_TOKEN', 'error should mention JPMORGAN_ACCESS_TOKEN');
  }
  assert(threw, 'should have thrown an error when token not set');
});

asyncTest('retrieveBalances throws when relativeDateType combined with startDate', async () => {
  process.env.JPMORGAN_ACCESS_TOKEN = 'test-token';
  let threw = false;
  try {
    await jpmRetrieveBalances({
      accountList: [{ accountId: '123' }],
      relativeDateType: 'CURRENT_DAY',
      startDate: '2024-01-01'
    });
  } catch (err) {
    threw = true;
    assertIncludes(err.message, 'relativeDateType', 'error should mention relativeDateType');
  }
  assert(threw, 'should have thrown for invalid param combination');
  delete process.env.JPMORGAN_ACCESS_TOKEN;
});

asyncTest('retrieveBalances throws when accountList is empty', async () => {
  process.env.JPMORGAN_ACCESS_TOKEN = 'test-token';
  let threw = false;
  try {
    await jpmRetrieveBalances({ accountList: [] });
  } catch (err) {
    threw = true;
    assertIncludes(err.message, 'accountList', 'error should mention accountList');
  }
  assert(threw, 'should have thrown for empty accountList');
  delete process.env.JPMORGAN_ACCESS_TOKEN;
});

// ─── ASYNC QUEUE + SUMMARY ────────────────────────────────────────────────────
(async () => {
  if (asyncQueue.length > 0) {
    console.log('\n=== ASYNC TESTS ===\n');
    for (const { name, fn } of asyncQueue) {
      try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
      } catch (err) {
        console.log(`  ❌ FAIL: ${name}`);
        console.log(`         ${err.message}`);
        failed++;
      }
    }
  }

  console.log('\n=== TEST SUMMARY ===\n');
  console.log(`  Total:  ${passed + failed}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('');

  if (failed > 0) {
    console.log('❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('✅ All critical-path tests passed!');
    process.exit(0);
  }
})();
