// Task priority: allowed levels, normalization of untrusted values, sort rank and labels.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PRIORITIES, DEFAULT_PRIORITY, normalizePriority, priorityRank, priorityLabel } = require('../priority');

test('priority: three levels, Medium by default', () => {
  assert.deepEqual(PRIORITIES, ['high', 'medium', 'low']);
  assert.equal(DEFAULT_PRIORITY, 'medium');
});

test('priority: normalizePriority keeps allowed values and turns anything else into medium', () => {
  for (const p of PRIORITIES) assert.equal(normalizePriority(p), p);
  for (const bad of ['urgent', 'HIGH', '', null, undefined, 3, { high: true }, ['low']]) {
    assert.equal(normalizePriority(bad), 'medium', `for ${JSON.stringify(bad)}`);
  }
});

test('priority: rank orders High < Medium < Low, unknown counts as Medium', () => {
  assert.deepEqual(['low', 'high', 'medium'].sort((a, b) => priorityRank(a) - priorityRank(b)), ['high', 'medium', 'low']);
  assert.equal(priorityRank('bogus'), priorityRank('medium'));
  assert.equal(priorityRank(undefined), priorityRank('medium'));
});

test('priority: labels for display', () => {
  assert.equal(priorityLabel('high'), 'High');
  assert.equal(priorityLabel('medium'), 'Medium');
  assert.equal(priorityLabel('low'), 'Low');
  assert.equal(priorityLabel('nope'), 'Medium');
});
