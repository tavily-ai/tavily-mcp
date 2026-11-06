import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AxiosError } from 'axios';

process.env.TAVILY_API_KEY = 'offline-placeholder';
process.env.TAVILY_API_BASE_URL = 'https://offline.invalid/v1';
process.env.TAVILY_CLIENT_NAME = 'test-host';
process.env.TAVILY_HUMAN_ID = 'test-user';
const { TavilyClient } = await import('../build/index.js');
const service = new TavilyClient();
const client = new Client({ name: 'offline-test', version: '1' });
const [a, b] = InMemoryTransport.createLinkedPair();
await service.server.connect(a);
await client.connect(b);
after(async () => { await client.close(); await service.server.close(); });
let requests = [];
let fixture = { query: 'q', results: [], request_id: 'request', usage: { credits: 0 } };
service.axiosInstance.defaults.adapter = async config => {
  requests.push({ body: config.data ? JSON.parse(config.data) : undefined, config });
  return { data: fixture, status: 200, statusText: 'OK', headers: {}, config };
};
const call = (name, args) => client.callTool({ name: `tavily_${name}`, arguments: args });

test('tools/list publishes current schemas', async () => {
  const { tools } = await client.listTools();
  const search = tools.find(t => t.name === 'tavily_search').inputSchema.properties;
  assert.equal(search.max_results.minimum, 0);
  for (const key of ['include_domains_mode', 'language', 'filter_by_language', 'safe_search', 'include_published_date', 'filter_by_published_date', 'include_answer', 'chunks_per_source', 'include_usage']) assert.ok(search[key], key);
  for (const endpoint of ['extract', 'crawl', 'map']) assert.ok(tools.find(t => t.name === `tavily_${endpoint}`).inputSchema.properties.timeout);
  for (const key of ['output_schema', 'files', 'include_domains', 'exclude_domains', 'output_length']) assert.ok(tools.find(t => t.name === 'tavily_research').inputSchema.properties[key]);
});

test('Search sends current options, preserves false/zero/empty overrides, headers and raw response', async () => {
  process.env.DEFAULT_PARAMETERS = JSON.stringify({ include_images: true, max_results: 15, include_domains: ['default.test'], search_depth: 'advanced' });
  const args = { query: 'q', max_results: 0, include_images: false, include_domains: [], search_depth: 'basic', chunks_per_source: 2, language: 'en', filter_by_language: true, safe_search: true, include_published_date: true, filter_by_published_date: false, include_answer: 'advanced', include_raw_content: 'text', include_usage: true, auto_parameters: false };
  const result = await call('search', args);
  delete process.env.DEFAULT_PARAMETERS;
  assert.equal(result.isError, undefined);
  const sent = requests.at(-1);
  for (const [key, value] of Object.entries(args)) if (key !== 'include_domains') assert.deepEqual(sent.body[key], value, key);
  assert.ok(!sent.body.include_domains?.length);
  assert.equal(sent.config.url, 'https://offline.invalid/v1/search');
  assert.equal(sent.config.headers.get('X-Client-Name'), 'test-host');
  assert.equal(sent.config.headers.get('X-Client-Source'), 'MCP');
  assert.equal(sent.config.headers.get('X-Human-Id'), 'test-user');
  assert.deepEqual(result.structuredContent, fixture);
  assert.match(result.content[0].text, /credits.*0/);
});

test('omitted Search fields use defaults; unknown defaults cannot replace authentication', async () => {
  process.env.DEFAULT_PARAMETERS = JSON.stringify({ max_results: 13, include_images: true, api_key: 'must-not-forward' });
  await call('search', { query: 'q' });
  delete process.env.DEFAULT_PARAMETERS;
  assert.equal(requests.at(-1).body.max_results, 13);
  assert.equal(requests.at(-1).body.include_images, true);
  assert.equal(requests.at(-1).body.api_key, 'offline-placeholder');
});

test('Extract, Crawl and Map send all current options and preserve complete responses', async () => {
  for (const [name, args] of [
    ['extract', { urls: ['https://example.test'], query: 'q', chunks_per_source: 5, timeout: 60, include_usage: true }],
    ['crawl', { url: 'https://example.test', instructions: 'docs', chunks_per_source: 5, timeout: 150, exclude_paths: ['/private'], exclude_domains: ['blocked.test'], include_images: true, include_usage: true }],
    ['map', { url: 'https://example.test', timeout: 150, exclude_paths: ['/private'], exclude_domains: ['blocked.test'], include_usage: true }],
  ]) {
    fixture = name === 'map' ? { base_url: args.url, results: ['https://example.test'], request_id: 'r', usage: { credits: 0 } } : { base_url: args.url, results: [{ url: 'https://example.test', raw_content: 'x'.repeat(400), images: ['image'] }], failed_results: [{ url: 'bad', error: 'failed' }], request_id: 'r', usage: { credits: 0 } };
    const result = await call(name, args);
    assert.equal(result.isError, undefined, result.content[0].text);
    for (const [key, value] of Object.entries(args)) assert.deepEqual(requests.at(-1).body[key], value);
    assert.deepEqual(result.structuredContent, fixture);
    if (name === 'crawl') assert.match(result.content[0].text, /x{400}/);
  }
});

test('invalid combinations and schema bounds fail before any HTTP request', async () => {
  for (const [name, args] of [
    ['search', { query: 'q', include_domains_mode: 'prefer' }],
    ['search', { query: 'q', filter_by_language: true }],
    ['search', { query: 'q', chunks_per_source: 2, search_depth: 'ultra-fast' }],
    ['search', { query: 'q', safe_search: true, search_depth: 'fast' }],
    ['search', { query: 'q', max_results: 21 }],
    ['search', { query: 'q', country: 'canada', topic: 'news' }],
    ['extract', { urls: ['https://example.test'], timeout: 0 }],
    ['extract', { urls: ['https://example.test'], chunks_per_source: 2 }],
    ['crawl', { url: 'https://example.test', chunks_per_source: 2 }],
  ]) {
    const before = requests.length;
    const result = await call(name, args);
    assert.equal(result.isError, true, JSON.stringify(args));
    assert.equal(requests.length, before);
  }
});

test('Research errors set isError and current options reach the request', async () => {
  fixture = {}; // Missing request ID: no poll, no live request.
  const args = { input: 'question', model: 'mini', output_schema: { type: 'object' }, include_domains: ['example.test'], exclude_domains: [], output_length: 'short', files: [{ name: 'input.md', data: 'aGk=' }], citation_format: 'apa' };
  const result = await call('research', args);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /No request_id/);
  for (const [key, value] of Object.entries(args)) assert.deepEqual(requests.at(-1).body[key], value);
});

test('stream fallback preserves UTF-8 fragmented CRLF, structured content, sources and request metadata', async () => {
  const original = service.axiosInstance.defaults.adapter;
  const event = { request_id: 'stream-r', model: 'pro', choices: [{ delta: { content: { answer: 'café' }, sources: [{ url: 'https://example.test' }] } }] };
  const bytes = Buffer.from(`event: message\r\ndata: ${JSON.stringify(event)}\r\n\r\nevent: done\r\ndata: {}`);
  service.axiosInstance.defaults.adapter = async config => ({ data: Readable.from([...bytes].map(b => Buffer.from([b]))), status: 200, headers: {}, config });
  try {
    const result = await service.researchViaStream({ input: 'question' });
    assert.deepEqual(result.content, { answer: 'café' });
    assert.deepEqual(result.sources, [{ url: 'https://example.test' }]);
    assert.equal(result.request_id, 'stream-r');
  } finally { service.axiosInstance.defaults.adapter = original; }
});

test('stream EOF before done remains an error', async () => {
  const original = service.axiosInstance.defaults.adapter;
  service.axiosInstance.defaults.adapter = async config => ({ data: Readable.from(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n']), status: 200, headers: {}, config });
  try { assert.match((await service.researchViaStream({ input: 'q' })).error, /before completion/); }
  finally { service.axiosInstance.defaults.adapter = original; }
});

test('Research polling preserves the complete structured result after HTTP 201', async () => {
  const original = service.axiosInstance.defaults.adapter;
  const complete = { request_id: 'poll-r', status: 'completed', content: { answer: 'yes' }, sources: [{ url: 'https://example.test' }], usage: { credits: 0 } };
  service.axiosInstance.defaults.adapter = async config => ({ data: config.method === 'post' ? { request_id: 'poll-r' } : complete, status: config.method === 'post' ? 201 : 200, headers: {}, config });
  try {
    const result = await call('research', { input: 'q' });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, complete);
    assert.match(result.content[0].text, /example.test/);
  } finally { service.axiosInstance.defaults.adapter = original; }
});

test('HTTP errors keep structured status and retry metadata without changing keyless continuation', async () => {
  const original = service.axiosInstance.defaults.adapter;
  const data = { detail: { error: 'quota exhausted' }, request_id: 'failure-r' };
  service.axiosInstance.defaults.adapter = async config => { throw new AxiosError('HTTP 432', 'ERR_BAD_REQUEST', config, {}, { status: 432, data, headers: { 'retry-after': '3' }, config }); };
  try {
    const result = await call('search', { query: 'q' });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.status, 432);
    assert.equal(result.structuredContent.retry_after, '3');
    assert.deepEqual(result.structuredContent.error, data);
  } finally { service.axiosInstance.defaults.adapter = original; }
});
