import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import axios from 'axios';
import { describeError } from '../build/safe-error.js';

// A made-up key, built from parts so no literal in the repo looks like a real key to secret scanning.
const KEY = 'tvly' + '-dev-' + 'abcdefghijklmnopqrstuvwxyz012345';

test('an axios error is described without its request', async () => {
    const client = axios.create({ headers: { Authorization: `Bearer ${KEY}` } });
    let caught;
    try {
        await client.post('http://127.0.0.1:1/search', { api_key: KEY, query: 'x' }, { timeout: 500 });
    } catch (error) {
        caught = error;
    }
    assert.ok(caught, 'the call should fail');
    assert.ok(JSON.stringify(caught.config).includes(KEY), 'the raw error does carry the key');
    const line = describeError(caught);
    assert.ok(!line.includes(KEY));
    assert.match(line, /^(Axios)?Error: /);
});

test('the status and code are kept', () => {
    const error = Object.assign(new Error('Request failed with status code 401'), {
        name: 'AxiosError', code: 'ERR_BAD_REQUEST', response: { status: 401 },
    });
    assert.equal(describeError(error), 'AxiosError: Request failed with status code 401 (status 401, code ERR_BAD_REQUEST)');
});

test('a key in the message is masked', () => {
    assert.equal(describeError(new Error(`bad key ${KEY}`)), 'Error: bad key ****2345');
    assert.equal(describeError(`Bearer ${KEY}`), 'Bearer ****2345');
});

test('odd values do not throw', () => {
    assert.equal(describeError(null), 'unknown error');
    assert.equal(describeError(undefined), 'unknown error');
    assert.equal(describeError({}), 'Error: no message');
    assert.equal(describeError(42), '42');
});

test('no request body carries the key, the Authorization header does', () => {
    const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    assert.ok(!/api_key:\s*API_KEY/.test(source), 'a request body must not carry the key');
    assert.ok(source.includes("'Authorization': `Bearer ${API_KEY}`"));
});

test('errors are never logged as whole objects', () => {
    const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    assert.ok(!/console\.error\(\s*"\[MCP Error\]",\s*error\s*\)/.test(source));
    assert.ok(!/\.catch\(console\.error\)/.test(source));
});
