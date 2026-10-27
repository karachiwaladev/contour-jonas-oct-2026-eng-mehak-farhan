// Search (ticket #30): every typed word must appear, case-insensitively, in the title or one of the tags.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQuery, matchesSearch } = require('../search');

const task = (over) => ({ id: 1, title: 'Ship the quarterly report', done: false, tags: ['work', 'finance'], ...over });

test('parseQuery: lowercases and splits on whitespace; blank means no words', () => {
  assert.deepEqual(parseQuery('  REPORT   Work '), ['report', 'work']);
  assert.deepEqual(parseQuery(''), []);
  assert.deepEqual(parseQuery('   '), []);
  assert.deepEqual(parseQuery(undefined), []);
});

test('matchesSearch: no words matches every task', () => {
  assert.equal(matchesSearch(task(), []), true);
});

test('matchesSearch: a word can match part of the title or of a tag, ignoring case', () => {
  assert.equal(matchesSearch(task(), parseQuery('QUARTER')), true);
  assert.equal(matchesSearch(task(), parseQuery('fin')), true);
  assert.equal(matchesSearch(task(), parseQuery('milk')), false);
});

test('matchesSearch: every word must match (title or tag), not just one', () => {
  assert.equal(matchesSearch(task(), parseQuery('report work')), true);
  assert.equal(matchesSearch(task({ title: 'Write report', tags: ['home'] }), parseQuery('report work')), false);
});

test('matchesSearch: query text is matched literally, never as a pattern', () => {
  assert.equal(matchesSearch(task(), parseQuery('.*')), false);
  assert.equal(matchesSearch(task({ title: 'Fix a+b (urgent)' }), parseQuery('a+b (urgent)')), true);
});

test('matchesSearch: stored tasks are untrusted; a missing title or non-array tags never throw', () => {
  assert.equal(matchesSearch({ tags: 'work' }, parseQuery('work')), false);
  assert.equal(matchesSearch({ title: 'Plan trip' }, parseQuery('trip')), true);
  assert.equal(matchesSearch({ title: 42, tags: [null, 'home'] }, parseQuery('home')), true);
});
