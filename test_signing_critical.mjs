/**
 * Critical-path tests for src/signing.service.ts
 *
 * Signing tests:
 *   1.  isSigningConfigured() → false when key file is absent (default path)
 *   2.  getSigningConfig()    → returns correct shape with configured=false
 *   3.  signPayload()         → throws descriptive error when key is absent
 *   4.  isSigningConfigured() → true when SIGNING_KEY_PATH points to a real key file
 *   5.  signPayloadBase64()   → returns valid base64 string with a real key
 *   6.  verifySignature()     → correctly validates a round-trip signature
 *   7.  verifySignature()     → returns false for tampered payload
 *
 * Encryption tests:
 *   8.  isEncryptionConfigured() → false when JPM public key file is absent
 *   9.  getEncryptionConfig()    → returns correct shape with configured=false
 *   10. encryptPayload()         → throws descriptive error when key is absent
 *   11. isEncryptionConfigured() → true when JPM_PUBLIC_KEY_PATH points to a real key
 *   12. encryptPayloadBase64()   → returns non-empty base64 string
 *   13. encrypted output differs from plaintext input
 *   14. sign-then-encrypt: signature covers plaintext; encrypted body is different
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ─── Import compiled signing service ─────────────────────────────────────────
import {
  isSigningConfigured,
  getSigningConfig,
  signPayload,
  signPayloadBase64,
  verifySignature,
  isEncryptionConfigured,
  getEncryptionConfig,
  encryptPayload,
  encryptPayloadBase64,
  isCallbackVerificationConfigured,
  getCallbackVerificationConfig,
  verifyCallbackSignature,
  verifyCallbackSignatureBase64
} from './build/signing.service.js';

import {
  isMtlsConfigured,
  getMtlsConfig,
  createMtlsAgent,
  getMtlsAxiosConfig
} from './build/mtls.service.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function assertThrows(fn, expectedFragment) {
  let threw = false;
  try { fn(); } catch (err) {
    threw = true;
    if (expectedFragment && !err.message.includes(expectedFragment)) {
      throw new Error(
        `Expected error containing "${expectedFragment}" but got: "${err.message}"`
      );
    }
  }
  if (!threw) throw new Error('Expected function to throw but it did not');
}

// ─── Suite 1: No key configured (default path does not exist) ─────────────────

console.log('\n📋 Suite 1: Signing NOT configured (no key file at default path)\n');

// Ensure SIGNING_KEY_PATH is unset so the default path is used
delete process.env.SIGNING_KEY_PATH;

test('isSigningConfigured() returns false when key file is absent', () => {
  assert(isSigningConfigured() === false, 'Expected false');
});

test('getSigningConfig() returns configured=false and correct algorithm', () => {
  const cfg = getSigningConfig();
  assert(cfg.configured === false, 'configured should be false');
  assert(cfg.algorithm === 'RSA-SHA256', `algorithm should be RSA-SHA256, got ${cfg.algorithm}`);
  assert(typeof cfg.keyPath === 'string' && cfg.keyPath.length > 0, 'keyPath should be a non-empty string');
  console.log(`         keyPath reported: ${cfg.keyPath}`);
});

test('signPayload() throws a descriptive error when key file is absent', () => {
  assertThrows(
    () => signPayload('test-payload'),
    '[SigningService]'
  );
});

test('signPayloadBase64() throws a descriptive error when key file is absent', () => {
  assertThrows(
    () => signPayloadBase64('test-payload'),
    '[SigningService]'
  );
});

// ─── Suite 2: Key configured (generate a temporary RSA key pair) ──────────────

console.log('\n📋 Suite 2: Signing IS configured (temporary RSA-2048 key)\n');

// Generate a temporary RSA key pair for testing
const { privateKey: privKeyObj, publicKey: pubKeyObj } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// Write private key to a temp file
const tmpDir     = os.tmpdir();
const tmpKeyPath = path.join(tmpDir, `test-signing-key-${Date.now()}.pem`);
fs.writeFileSync(tmpKeyPath, privKeyObj, { mode: 0o600 });

// Point the service at the temp key
process.env.SIGNING_KEY_PATH = tmpKeyPath;

const testPayload = JSON.stringify({
  accountList: [{ accountId: '00000000000000304266256' }],
  relativeDateType: 'CURRENT_DAY'
});

test('isSigningConfigured() returns true when key file exists', () => {
  assert(isSigningConfigured() === true, 'Expected true');
});

test('getSigningConfig() returns configured=true with correct keyPath', () => {
  const cfg = getSigningConfig();
  assert(cfg.configured === true, 'configured should be true');
  assert(cfg.keyPath === tmpKeyPath, `keyPath mismatch: ${cfg.keyPath}`);
});

let b64Signature;

test('signPayloadBase64() returns a non-empty base64 string', () => {
  b64Signature = signPayloadBase64(testPayload);
  assert(typeof b64Signature === 'string' && b64Signature.length > 0, 'Expected non-empty string');
  // Validate it is valid base64
  const decoded = Buffer.from(b64Signature, 'base64');
  assert(decoded.length > 0, 'Decoded signature should have bytes');
  console.log(`         Signature length: ${b64Signature.length} chars (base64)`);
});

test('verifySignature() returns true for a valid round-trip signature', () => {
  assert(b64Signature, 'b64Signature must be set from previous test');
  const valid = verifySignature(testPayload, b64Signature, pubKeyObj);
  assert(valid === true, 'Expected signature to verify as valid');
});

test('verifySignature() returns false for a tampered payload', () => {
  const tamperedPayload = testPayload + ' TAMPERED';
  const valid = verifySignature(tamperedPayload, b64Signature, pubKeyObj);
  assert(valid === false, 'Expected tampered payload to fail verification');
});

test('signPayload() returns a Buffer', () => {
  const raw = signPayload(Buffer.from(testPayload));
  assert(Buffer.isBuffer(raw), 'Expected a Buffer');
  assert(raw.length > 0, 'Buffer should not be empty');
});

// ─── Suite 3: Header injection logic (unit-level, no real HTTP call) ──────────

console.log('\n📋 Suite 3: Header injection — signing active, no real HTTP call\n');

test('x-jpm-signature header value is a valid base64 RSA-SHA256 signature', () => {
  // Simulate what jpmorgan.ts does before the axios.post call
  const requestBody = {
    accountList: [{ accountId: '00000000000000304266256' }],
    relativeDateType: 'CURRENT_DAY'
  };
  const headerValue = signPayloadBase64(JSON.stringify(requestBody));
  assert(typeof headerValue === 'string' && headerValue.length > 0, 'Header value should be non-empty string');

  // Verify the header value is a valid signature of the exact serialized body
  const valid = verifySignature(JSON.stringify(requestBody), headerValue, pubKeyObj);
  assert(valid === true, 'Header signature should verify against the request body');
});

// ─── Suite 4: Encryption NOT configured (default path does not exist) ─────────

console.log('\n📋 Suite 4: Encryption NOT configured (no JPM public key at default path)\n');

delete process.env.JPM_PUBLIC_KEY_PATH;

test('isEncryptionConfigured() returns false when JPM public key is absent', () => {
  assert(isEncryptionConfigured() === false, 'Expected false');
});

test('getEncryptionConfig() returns configured=false with correct keyPath', () => {
  const cfg = getEncryptionConfig();
  assert(cfg.configured === false, 'configured should be false');
  assert(typeof cfg.keyPath === 'string' && cfg.keyPath.length > 0, 'keyPath should be non-empty');
  console.log(`         keyPath reported: ${cfg.keyPath}`);
});

test('encryptPayload() throws a descriptive error when JPM public key is absent', () => {
  assertThrows(
    () => encryptPayload('test-data'),
    '[EncryptionService]'
  );
});

test('encryptPayloadBase64() throws a descriptive error when JPM public key is absent', () => {
  assertThrows(
    () => encryptPayloadBase64('test-data'),
    '[EncryptionService]'
  );
});

// ─── Suite 5: Encryption IS configured (use the same RSA key pair as public key) ─

console.log('\n📋 Suite 5: Encryption IS configured (temporary RSA-2048 public key)\n');

// Write the public key to a temp file (simulating /certs/encryption/jpm_public.pem)
const tmpPubKeyPath = path.join(tmpDir, `test-jpm-pubkey-${Date.now()}.pem`);
fs.writeFileSync(tmpPubKeyPath, pubKeyObj, { mode: 0o644 });
process.env.JPM_PUBLIC_KEY_PATH = tmpPubKeyPath;

const encTestPayload = JSON.stringify({
  name: 'Acme Corp',
  type: 'BUSINESS',
  email: 'finance@acme.com'
});

test('isEncryptionConfigured() returns true when JPM public key file exists', () => {
  assert(isEncryptionConfigured() === true, 'Expected true');
});

test('getEncryptionConfig() returns configured=true with correct keyPath', () => {
  const cfg = getEncryptionConfig();
  assert(cfg.configured === true, 'configured should be true');
  assert(cfg.keyPath === tmpPubKeyPath, `keyPath mismatch: ${cfg.keyPath}`);
});

let encryptedB64;

test('encryptPayloadBase64() returns a non-empty base64 string', () => {
  encryptedB64 = encryptPayloadBase64(encTestPayload);
  assert(typeof encryptedB64 === 'string' && encryptedB64.length > 0, 'Expected non-empty string');
  const decoded = Buffer.from(encryptedB64, 'base64');
  assert(decoded.length > 0, 'Decoded encrypted payload should have bytes');
  console.log(`         Encrypted length: ${encryptedB64.length} chars (base64)`);
});

test('encrypted output differs from plaintext input', () => {
  assert(encryptedB64 !== encTestPayload, 'Encrypted output must not equal plaintext');
  assert(!encryptedB64.includes('"name"'), 'Encrypted output must not contain plaintext JSON keys');
});

test('encryptPayload() returns a Buffer', () => {
  const raw = encryptPayload(Buffer.from(encTestPayload));
  assert(Buffer.isBuffer(raw), 'Expected a Buffer');
  assert(raw.length > 0, 'Buffer should not be empty');
});

// ─── Suite 6: Sign-then-encrypt combined flow ─────────────────────────────────

console.log('\n📋 Suite 6: Combined sign-then-encrypt flow\n');

test('signature covers plaintext; encrypted body is different from plaintext', () => {
  const payload = JSON.stringify({ accountList: [{ accountId: '00000000000000304266256' }] });

  // Step 1: sign the plaintext
  const sig = signPayloadBase64(payload);
  assert(typeof sig === 'string' && sig.length > 0, 'Signature should be non-empty');

  // Step 2: verify signature against plaintext (not encrypted body)
  const valid = verifySignature(payload, sig, pubKeyObj);
  assert(valid === true, 'Signature should verify against original plaintext');

  // Step 3: encrypt the plaintext
  const encrypted = encryptPayloadBase64(payload);
  assert(encrypted !== payload, 'Encrypted body must differ from plaintext');

  // Step 4: signature must NOT verify against the encrypted body
  const invalidOnEncrypted = verifySignature(encrypted, sig, pubKeyObj);
  assert(invalidOnEncrypted === false, 'Signature must not verify against encrypted body (proves sign-then-encrypt order)');
});

test('x-jpm-encrypted header flag is set correctly when encryption is active', () => {
  // Simulate the header logic from jpmorgan.ts / jpmorgan_embedded.ts
  const headers = { 'Content-Type': 'application/json' };
  if (isEncryptionConfigured()) {
    headers['Content-Type'] = 'application/octet-stream';
    headers['x-jpm-encrypted'] = 'true';
  }
  assert(headers['Content-Type'] === 'application/octet-stream', 'Content-Type should be application/octet-stream');
  assert(headers['x-jpm-encrypted'] === 'true', 'x-jpm-encrypted header should be "true"');
});

// ─── Suite 7: Callback verification NOT configured ────────────────────────────

console.log('\n📋 Suite 7: Callback verification NOT configured (no cert at default path)\n');

delete process.env.JPM_CALLBACK_CERT_PATH;

test('isCallbackVerificationConfigured() returns false when cert is absent', () => {
  assert(isCallbackVerificationConfigured() === false, 'Expected false');
});

test('getCallbackVerificationConfig() returns configured=false with correct certPath', () => {
  const cfg = getCallbackVerificationConfig();
  assert(cfg.configured === false, 'configured should be false');
  assert(typeof cfg.certPath === 'string' && cfg.certPath.length > 0, 'certPath should be non-empty');
  console.log(`         certPath reported: ${cfg.certPath}`);
});

test('verifyCallbackSignature() throws [CallbackVerification] error when cert is absent', () => {
  assertThrows(
    () => verifyCallbackSignature('body', Buffer.alloc(256)),
    '[CallbackVerification]'
  );
});

test('verifyCallbackSignatureBase64() throws [CallbackVerification] error when cert is absent', () => {
  assertThrows(
    () => verifyCallbackSignatureBase64('body', Buffer.alloc(256).toString('base64')),
    '[CallbackVerification]'
  );
});

// ─── Suite 8: Callback verification IS configured ─────────────────────────────

console.log('\n📋 Suite 8: Callback verification IS configured (temporary RSA-2048 cert)\n');

// Simulate JPM's callback cert using the same RSA public key (PEM format)
// In production this would be an X.509 cert; Node crypto.verify accepts both
const tmpCallbackCertPath = path.join(tmpDir, `test-jpm-callback-cert-${Date.now()}.pem`);
fs.writeFileSync(tmpCallbackCertPath, pubKeyObj, { mode: 0o644 });
process.env.JPM_CALLBACK_CERT_PATH = tmpCallbackCertPath;

const callbackBody = JSON.stringify({
  event: 'payment.completed',
  accountId: '00000000000000304266256',
  amount: 1000
});

// Simulate JPM signing the callback body with their private key
const callbackSigBuffer = crypto.sign('RSA-SHA256', Buffer.from(callbackBody), privKeyObj);
const callbackSigBase64 = callbackSigBuffer.toString('base64');

test('isCallbackVerificationConfigured() returns true when cert file exists', () => {
  assert(isCallbackVerificationConfigured() === true, 'Expected true');
});

test('getCallbackVerificationConfig() returns configured=true with correct certPath', () => {
  const cfg = getCallbackVerificationConfig();
  assert(cfg.configured === true, 'configured should be true');
  assert(cfg.certPath === tmpCallbackCertPath, `certPath mismatch: ${cfg.certPath}`);
});

test('verifyCallbackSignature() returns true for a valid JPM callback (Buffer sig)', () => {
  const valid = verifyCallbackSignature(callbackBody, callbackSigBuffer);
  assert(valid === true, 'Expected valid callback signature');
});

test('verifyCallbackSignatureBase64() returns true for a valid JPM callback (base64 sig)', () => {
  const valid = verifyCallbackSignatureBase64(callbackBody, callbackSigBase64);
  assert(valid === true, 'Expected valid callback signature (base64)');
});

test('verifyCallbackSignatureBase64() returns false for a tampered callback body', () => {
  const tamperedBody = callbackBody + ' TAMPERED';
  const valid = verifyCallbackSignatureBase64(tamperedBody, callbackSigBase64);
  assert(valid === false, 'Expected tampered callback body to fail verification');
});

test('verifyCallbackSignatureBase64() returns false for a forged signature', () => {
  const forgedSig = Buffer.alloc(256, 0).toString('base64'); // all-zero signature
  const valid = verifyCallbackSignatureBase64(callbackBody, forgedSig);
  assert(valid === false, 'Expected forged signature to fail verification');
});

// ─── Suite 9: mTLS NOT configured (default paths do not exist) ───────────────

console.log('\n📋 Suite 9: mTLS NOT configured (no cert files at default paths)\n');

delete process.env.MTLS_CLIENT_CERT_PATH;
delete process.env.MTLS_CLIENT_KEY_PATH;
delete process.env.MTLS_CA_BUNDLE_PATH;

test('isMtlsConfigured() returns false when cert files are absent', () => {
  assert(isMtlsConfigured() === false, 'Expected false');
});

test('getMtlsConfig() returns configured=false with correct default paths', () => {
  const cfg = getMtlsConfig();
  assert(cfg.configured === false, 'configured should be false');
  assert(cfg.clientCertPath.includes('client.crt'), `clientCertPath should contain client.crt, got: ${cfg.clientCertPath}`);
  assert(cfg.clientKeyPath.includes('client.key'),  `clientKeyPath should contain client.key, got: ${cfg.clientKeyPath}`);
  assert(cfg.caBundlePath.includes('jpm_ca_bundle'), `caBundlePath should contain jpm_ca_bundle, got: ${cfg.caBundlePath}`);
  console.log(`         clientCertPath: ${cfg.clientCertPath}`);
  console.log(`         clientKeyPath:  ${cfg.clientKeyPath}`);
  console.log(`         caBundlePath:   ${cfg.caBundlePath}`);
});

test('createMtlsAgent() throws [MtlsService] error when cert files are absent', () => {
  assertThrows(() => createMtlsAgent(), '[MtlsService]');
});

test('getMtlsAxiosConfig() throws [MtlsService] error when cert files are absent', () => {
  assertThrows(() => getMtlsAxiosConfig(), '[MtlsService]');
});

// ─── Suite 10: mTLS IS configured (temporary self-signed cert files) ──────────

console.log('\n📋 Suite 10: mTLS IS configured (temporary PEM cert files)\n');

// Generate a second RSA key pair to simulate the mTLS client cert + key
const { privateKey: mtlsPrivKey, publicKey: mtlsPubKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// Write the three mTLS files to temp paths
const tmpMtlsCertPath = path.join(tmpDir, `test-mtls-client-cert-${Date.now()}.pem`);
const tmpMtlsKeyPath  = path.join(tmpDir, `test-mtls-client-key-${Date.now()}.pem`);
const tmpMtlsCaPath   = path.join(tmpDir, `test-mtls-ca-bundle-${Date.now()}.pem`);

fs.writeFileSync(tmpMtlsCertPath, mtlsPubKey,  { mode: 0o644 }); // cert (public key as stand-in)
fs.writeFileSync(tmpMtlsKeyPath,  mtlsPrivKey, { mode: 0o600 }); // private key
fs.writeFileSync(tmpMtlsCaPath,   pubKeyObj,   { mode: 0o644 }); // CA bundle (reuse test pub key)

process.env.MTLS_CLIENT_CERT_PATH = tmpMtlsCertPath;
process.env.MTLS_CLIENT_KEY_PATH  = tmpMtlsKeyPath;
process.env.MTLS_CA_BUNDLE_PATH   = tmpMtlsCaPath;

test('isMtlsConfigured() returns true when all three cert files exist', () => {
  assert(isMtlsConfigured() === true, 'Expected true');
});

test('getMtlsConfig() returns configured=true with correct paths', () => {
  const cfg = getMtlsConfig();
  assert(cfg.configured === true, 'configured should be true');
  assert(cfg.clientCertPath === tmpMtlsCertPath, `clientCertPath mismatch: ${cfg.clientCertPath}`);
  assert(cfg.clientKeyPath  === tmpMtlsKeyPath,  `clientKeyPath mismatch: ${cfg.clientKeyPath}`);
  assert(cfg.caBundlePath   === tmpMtlsCaPath,   `caBundlePath mismatch: ${cfg.caBundlePath}`);
});

test('createMtlsAgent() returns an https.Agent instance', () => {
  const agent = createMtlsAgent();
  assert(agent !== null && typeof agent === 'object', 'Expected an object');
  assert(typeof agent.destroy === 'function', 'Expected https.Agent with destroy() method');
  agent.destroy();
});

test('getMtlsAxiosConfig() returns { httpsAgent } with an https.Agent', () => {
  const config = getMtlsAxiosConfig();
  assert(config !== null && typeof config === 'object', 'Expected an object');
  assert('httpsAgent' in config, 'Expected httpsAgent key');
  assert(typeof config.httpsAgent === 'object', 'httpsAgent should be an object');
  assert(typeof config.httpsAgent.destroy === 'function', 'httpsAgent should be an https.Agent');
  config.httpsAgent.destroy();
});

test('isMtlsConfigured() returns false when only one file is missing', () => {
  // Temporarily remove one file to verify all-or-nothing check
  const savedCert = process.env.MTLS_CLIENT_CERT_PATH;
  process.env.MTLS_CLIENT_CERT_PATH = '/nonexistent/path/client.crt';
  assert(isMtlsConfigured() === false, 'Expected false when one file is missing');
  process.env.MTLS_CLIENT_CERT_PATH = savedCert;
  // Restore and confirm it's back to true
  assert(isMtlsConfigured() === true, 'Expected true after restoring cert path');
});

// ─── Suite 11: JPMORGAN_ENV=production switches all paths to /certs/prod ──────

console.log('\n📋 Suite 11: JPMORGAN_ENV=production → /certs/prod paths\n');

// Clear all explicit overrides so derived defaults are used
delete process.env.SIGNING_KEY_PATH;
delete process.env.JPM_PUBLIC_KEY_PATH;
delete process.env.JPM_CALLBACK_CERT_PATH;
delete process.env.MTLS_CLIENT_CERT_PATH;
delete process.env.MTLS_CLIENT_KEY_PATH;
delete process.env.MTLS_CA_BUNDLE_PATH;

process.env.JPMORGAN_ENV = 'production';

test('getSigningConfig() keyPath uses /certs/prod when JPMORGAN_ENV=production', () => {
  const cfg = getSigningConfig();
  assert(cfg.keyPath === '/certs/prod/signature/private.key',
    `Expected /certs/prod/signature/private.key, got: ${cfg.keyPath}`);
  console.log(`         keyPath: ${cfg.keyPath}`);
});

test('getEncryptionConfig() keyPath uses /certs/prod when JPMORGAN_ENV=production', () => {
  const cfg = getEncryptionConfig();
  assert(cfg.keyPath === '/certs/prod/encryption/jpm_public.pem',
    `Expected /certs/prod/encryption/jpm_public.pem, got: ${cfg.keyPath}`);
  console.log(`         keyPath: ${cfg.keyPath}`);
});

test('getCallbackVerificationConfig() certPath uses /certs/prod when JPMORGAN_ENV=production', () => {
  const cfg = getCallbackVerificationConfig();
  assert(cfg.certPath === '/certs/prod/callback/jpm_callback.crt',
    `Expected /certs/prod/callback/jpm_callback.crt, got: ${cfg.certPath}`);
  console.log(`         certPath: ${cfg.certPath}`);
});

test('getMtlsConfig() paths use /certs/prod when JPMORGAN_ENV=production', () => {
  const cfg = getMtlsConfig();
  assert(cfg.clientCertPath === '/certs/prod/transport/client.crt',
    `Expected /certs/prod/transport/client.crt, got: ${cfg.clientCertPath}`);
  assert(cfg.clientKeyPath === '/certs/prod/transport/client.key',
    `Expected /certs/prod/transport/client.key, got: ${cfg.clientKeyPath}`);
  assert(cfg.caBundlePath === '/certs/prod/transport/jpm_ca_bundle.crt',
    `Expected /certs/prod/transport/jpm_ca_bundle.crt, got: ${cfg.caBundlePath}`);
  console.log(`         clientCertPath: ${cfg.clientCertPath}`);
  console.log(`         clientKeyPath:  ${cfg.clientKeyPath}`);
  console.log(`         caBundlePath:   ${cfg.caBundlePath}`);
});

test('explicit SIGNING_KEY_PATH overrides JPMORGAN_ENV=production default', () => {
  process.env.SIGNING_KEY_PATH = '/custom/my-signing.key';
  const cfg = getSigningConfig();
  assert(cfg.keyPath === '/custom/my-signing.key',
    `Expected /custom/my-signing.key, got: ${cfg.keyPath}`);
  delete process.env.SIGNING_KEY_PATH;
  // Confirm it reverts to prod default after deletion
  const cfgAfter = getSigningConfig();
  assert(cfgAfter.keyPath === '/certs/prod/signature/private.key',
    `Expected prod default after deletion, got: ${cfgAfter.keyPath}`);
});

// Restore to testing (UAT) and verify revert
process.env.JPMORGAN_ENV = 'testing';

test('getSigningConfig() keyPath reverts to /certs/uat when JPMORGAN_ENV=testing', () => {
  const cfg = getSigningConfig();
  assert(cfg.keyPath === '/certs/uat/signature/private.key',
    `Expected /certs/uat/signature/private.key, got: ${cfg.keyPath}`);
  console.log(`         keyPath: ${cfg.keyPath}`);
});

test('getMtlsConfig() paths revert to /certs/uat when JPMORGAN_ENV=testing', () => {
  const cfg = getMtlsConfig();
  assert(cfg.clientCertPath === '/certs/uat/transport/client.crt',
    `Expected /certs/uat/transport/client.crt, got: ${cfg.clientCertPath}`);
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

try { fs.unlinkSync(tmpKeyPath); } catch {}
try { fs.unlinkSync(tmpPubKeyPath); } catch {}
try { fs.unlinkSync(tmpCallbackCertPath); } catch {}
try { fs.unlinkSync(tmpMtlsCertPath); } catch {}
try { fs.unlinkSync(tmpMtlsKeyPath); } catch {}
try { fs.unlinkSync(tmpMtlsCaPath); } catch {}
delete process.env.SIGNING_KEY_PATH;
delete process.env.JPM_PUBLIC_KEY_PATH;
delete process.env.JPM_CALLBACK_CERT_PATH;
delete process.env.MTLS_CLIENT_CERT_PATH;
delete process.env.MTLS_CLIENT_KEY_PATH;
delete process.env.MTLS_CA_BUNDLE_PATH;
delete process.env.JPMORGAN_ENV;

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('❌ Some tests FAILED.');
  process.exit(1);
} else {
  console.log('✅ All critical-path tests PASSED.');
}
