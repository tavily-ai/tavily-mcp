import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const packDir = await mkdtemp(path.join(os.tmpdir(), 'tavily-mcp-pack-'));
const packResult = await execFileAsync('npm', ['pack', '--pack-destination', packDir], { cwd: root });
const tarballName = packResult.stdout
  .trim()
  .split('\n')
  .find((line) => line.endsWith('.tgz'));
assert.ok(tarballName, 'npm pack did not print a tarball path');
const tarball = path.join(packDir, tarballName);
const npmEnv = { ...process.env };
delete npmEnv.npm_config_npm_globalconfig;
delete npmEnv.npm_config_verify_deps_before_run;
delete npmEnv.npm_config__jsr_registry;

test.after(async () => {
  await rm(packDir, { recursive: true, force: true });
});

async function runTavilyMcp(args) {
  try {
    const { stdout, stderr } = await execFileAsync(
      'npm',
      ['exec', '--yes', `--package=${tarball}`, '--', 'tavily-mcp', ...args],
      { cwd: path.dirname(packDir), env: npmEnv }
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? ''
    };
  }
}

test('top-level version flag prints the package version', async () => {
  const result = await runTavilyMcp(['--version']);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), pkg.version);
});

test('top-level help remains successful', async () => {
  const result = await runTavilyMcp(['--help']);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /List all available tools and exit/);
});
