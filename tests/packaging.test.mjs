import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { spawn } from 'node:child_process';

const yaml = readFileSync(new URL('../smithery.yaml', import.meta.url), 'utf8');
const functionText = yaml.slice(yaml.indexOf('config =>'));
const command = runInNewContext(`(${functionText})`);

test('Docker and Smithery do not inject or require a placeholder API key', () => {
  assert.doesNotMatch(readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8'), /ENV\s+TAVILY_API_KEY=/);
  assert.doesNotMatch(yaml, /required:\s*\n\s*- tavilyApiKey/);
  assert.equal('TAVILY_API_KEY' in command({}).env, false);
});

test('Smithery forwards optional settings without changing explicit false/zero defaults', () => {
  const config = { tavilyApiKey: 'offline-placeholder', defaultParameters: { include_images: false, max_results: 0 }, clientName: 'smithery-test', humanId: 'user', projectId: 'project', sessionId: 'session', apiBaseUrl: 'https://offline.invalid' };
  const result = command(config);
  assert.equal(result.env.TAVILY_API_KEY, config.tavilyApiKey);
  assert.equal(result.env.DEFAULT_PARAMETERS, JSON.stringify(config.defaultParameters));
  for (const [key, env] of [['clientName','TAVILY_CLIENT_NAME'],['humanId','TAVILY_HUMAN_ID'],['projectId','TAVILY_PROJECT_ID'],['sessionId','TAVILY_SESSION_ID'],['apiBaseUrl','TAVILY_API_BASE_URL']]) assert.equal(result.env[env], config[key]);
});

test('the generated no-key launch enters keyless mode without making a tool call', async () => {
  const start = command({});
  const env = { ...process.env, ...start.env };
  delete env.TAVILY_API_KEY;
  const child = spawn(process.execPath, start.args, { cwd: new URL('..', import.meta.url), env, stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('keyless startup message not received')), 5000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.stderr.on('data', chunk => { if (String(chunk).includes('running in keyless mode')) { clearTimeout(timer); resolve(); } });
      child.on('exit', code => { clearTimeout(timer); if (code) reject(new Error(`startup exited ${code}`)); });
    });
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('close', resolve));
  }
});
