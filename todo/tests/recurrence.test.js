// Recurring tasks: next due date arithmetic and the "complete -> create next occurrence" rule.
const test = require('node:test');
const assert = require('node:assert/strict');
const { REPEATS, normalizeRepeat, nextDue, nextOccurrence, repeatLabel } = require('../recurrence');

const at = (y, mo, d, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi); // local time, 1-based month

test('REPEATS lists the supported patterns', () => {
  assert.deepEqual(REPEATS, ['none', 'daily', 'weekly', 'monthly']);
});

test('normalizeRepeat allowlists values; anything else becomes "none"', () => {
  for (const r of REPEATS) assert.equal(normalizeRepeat(r), r);
  for (const bad of ['hourly', 'DAILY', '', null, undefined, 7, { daily: true }, ['weekly']]) {
    assert.equal(normalizeRepeat(bad), 'none', `for ${JSON.stringify(bad)}`);
  }
});

test('daily: next day at the same time', () => {
  assert.equal(nextDue('2026-10-26T18:00', 'daily', at(2026, 10, 26, 12)), '2026-10-27T18:00');
});

test('weekly: one week later at the same time', () => {
  assert.equal(nextDue('2026-10-26T09:30', 'weekly', at(2026, 10, 26, 8)), '2026-11-02T09:30');
});

test('monthly: same day next month, keeping the time', () => {
  assert.equal(nextDue('2026-10-15T07:00', 'monthly', at(2026, 10, 15, 6)), '2026-11-15T07:00');
});

test('monthly: Jan 31 clamps to the end of February (28, or 29 in a leap year)', () => {
  assert.equal(nextDue('2026-01-31T10:00', 'monthly', at(2026, 1, 31, 9)), '2026-02-28T10:00');
  assert.equal(nextDue('2028-01-31T10:00', 'monthly', at(2028, 1, 31, 9)), '2028-02-29T10:00');
});

test('monthly: catch-up keeps the original day instead of drifting (Jan 31 -> Mar 31)', () => {
  assert.equal(nextDue('2026-01-31T10:00', 'monthly', at(2026, 3, 1, 9)), '2026-03-31T10:00');
});

test('catch-up: a weekly task due 3 weeks ago jumps to the first future date, not an overdue one', () => {
  // due Mon Oct 5 09:00; now Mon Oct 26 12:00 -> Oct 26 09:00 is already past -> Nov 2 09:00
  assert.equal(nextDue('2026-10-05T09:00', 'weekly', at(2026, 10, 26, 12)), '2026-11-02T09:00');
});

test('no due date: one period from now', () => {
  assert.equal(nextDue(null, 'daily', at(2026, 10, 26, 12, 34)), '2026-10-27T12:34');
  assert.equal(nextDue(null, 'weekly', at(2026, 10, 26, 12, 34)), '2026-11-02T12:34');
});

test('invalid stored due string is treated as no due date (never throws)', () => {
  assert.equal(nextDue('garbage', 'daily', at(2026, 10, 26, 12, 34)), '2026-10-27T12:34');
});

test('catch-up is capped: absurdly old dates fall back to one period from now', () => {
  assert.equal(nextDue('1900-01-01T00:00', 'daily', at(2026, 10, 26, 12, 0)), '2026-10-27T12:00');
});

test('nextDue returns null for non-recurring tasks', () => {
  assert.equal(nextDue('2026-10-26T18:00', 'none', at(2026, 10, 26, 12)), null);
});

test('nextOccurrence: completed recurring task -> new open task with same title, tags and repeat', () => {
  const done = { id: 3, title: 'Water plants', done: true, due: '2026-10-26T18:00', tags: ['home'], repeat: 'daily', spawnedNext: false };
  assert.deepEqual(nextOccurrence(done, at(2026, 10, 26, 12)),
    { title: 'Water plants', due: '2026-10-27T18:00', tags: ['home'], repeat: 'daily' });
});

test('nextOccurrence: nothing for open, non-recurring, already-spawned or tampered tasks', () => {
  const base = { title: 'x', done: true, due: null, tags: [], repeat: 'weekly', spawnedNext: false };
  const now = at(2026, 10, 26);
  assert.equal(nextOccurrence({ ...base, done: false }, now), null);
  assert.equal(nextOccurrence({ ...base, repeat: 'none' }, now), null);
  assert.equal(nextOccurrence({ ...base, spawnedNext: true }, now), null);
  assert.equal(nextOccurrence({ ...base, repeat: 'hourly' }, now), null);
});

test('repeatLabel: human label, empty for none', () => {
  assert.equal(repeatLabel('daily'), '↻ Daily');
  assert.equal(repeatLabel('weekly'), '↻ Weekly');
  assert.equal(repeatLabel('monthly'), '↻ Monthly');
  assert.equal(repeatLabel('none'), '');
  assert.equal(repeatLabel('bogus'), '');
});
