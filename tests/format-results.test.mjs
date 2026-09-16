import assert from 'node:assert/strict';
import test from 'node:test';
import { formatResults } from '../build/format-results.js';

const requestId = '00000000-0000-4000-8000-000000000001';
const response = {
  query: 'Tavily MCP setup',
  answer: 'Use the MCP setup guide.',
  results: [{
    id: '25d31b-01',
    title: 'Tavily MCP Server',
    url: 'https://docs.tavily.com/documentation/mcp',
    content: 'MCP setup instructions.',
    score: 0.9,
    raw_content: 'Full setup instructions.',
    favicon: 'https://docs.tavily.com/favicon.ico',
  }],
  images: [
    'https://example.com/setup.png',
    { url: 'https://example.com/diagram.png', description: 'Setup diagram' },
  ],
};
const existingOutput = [
  'Answer: Use the MCP setup guide.',
  'Detailed Results:',
  '',
  'Title: Tavily MCP Server',
  'ID: 25d31b-01',
  'URL: https://docs.tavily.com/documentation/mcp',
  'Content: MCP setup instructions.',
  'Raw Content: Full setup instructions.',
  'Favicon: https://docs.tavily.com/favicon.ico',
  '',
  'Images:',
  '',
  '[1] URL: https://example.com/setup.png',
  '',
  '[2] URL: https://example.com/diagram.png',
  '   Description: Setup diagram',
].join('\n');

test('exposes the upstream request ID and preserves result IDs and content', () => {
  assert.equal(
    formatResults({ ...response, request_id: requestId }),
    'Request ID: ' + requestId + '\n' + existingOutput,
  );
});

test('preserves existing output when the response has no request ID', () => {
  assert.equal(formatResults(response), existingOutput);
});

test('does not invent a request ID when the upstream ID is empty', () => {
  assert.equal(formatResults({ ...response, request_id: '' }), existingOutput);
});

test('exposes the request ID even when a search returns no results', () => {
  assert.equal(
    formatResults({ query: 'No matches', request_id: requestId, results: [] }),
    'Request ID: ' + requestId + '\nDetailed Results:',
  );
});
