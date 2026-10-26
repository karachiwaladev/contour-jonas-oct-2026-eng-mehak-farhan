// Fake credentials below are built by concatenation so this file never contains a literal secret.
const test = require('node:test');
const assert = require('node:assert/strict');
const { scanText } = require('../secret-scan');

const rules = (text) => scanText(text, 'f.js').map((f) => f.rule);

test('detects common provider keys', () => {
  assert.deepEqual(rules('k = "' + 'AKIA' + 'ABCDEFGHIJKLMNOP' + '"'), ['aws-access-key']);
  assert.deepEqual(rules('t = "' + 'ghp_' + 'a'.repeat(36) + '"'), ['github-token']);
  assert.deepEqual(rules('-----BEGIN ' + 'RSA PRIVATE KEY-----'), ['private-key']);
});

test('detects generic secret assignments with long values', () => {
  assert.deepEqual(rules('api_key = "' + 'aB3dE6gH9jK2mN5pQ8sT' + '"'), ['generic-secret-assignment']);
});

test('ignores short or obviously non-secret values', () => {
  assert.deepEqual(rules('password = "short"'), []);
  assert.deepEqual(rules('const passwordInput = document.getElementById("pw");'), []);
});

test('reports line numbers and never the matched text', () => {
  const [f] = scanText('ok\nk = "' + 'AKIA' + 'ABCDEFGHIJKLMNOP' + '"', 'x.js');
  assert.equal(f.line, 2);
  assert.deepEqual(Object.keys(f).sort(), ['file', 'line', 'rule']);
});

test('a secret-scan: allow comment suppresses the line', () => {
  assert.deepEqual(rules('k = "' + 'AKIA' + 'ABCDEFGHIJKLMNOP' + '" // secret-scan: allow'), []);
});
