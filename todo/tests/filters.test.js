// Pins down the todo app's filter, sort and label logic as it is today, before and after the refactor.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTags, dueInfo, compareTasks, matchesFilters, pruneTags, loadFilters, safeStorage, saveFilters } = require('../filters');

const task = (over) => ({ id: 1, title: 't', done: false, createdAt: 1, due: null, tags: [], ...over });

test('parseTags: trims, lowercases, drops empties and duplicates', () => {
  assert.deepEqual(parseTags('Work, work , Urgent'), ['work', 'urgent']);
  assert.deepEqual(parseTags(' , A ,a,, b ,'), ['a', 'b']);
  assert.deepEqual(parseTags(''), []);
});

test('compareTasks: open first by due date (undated last), then done by creation', () => {
  const tasks = [
    task({ title: 'done-old', done: true, createdAt: 1 }),
    task({ title: 'undated', createdAt: 2 }),
    task({ title: 'later', due: '2026-11-02T09:00', createdAt: 3 }),
    task({ title: 'sooner', due: '2026-10-27T09:00', createdAt: 4 }),
    task({ title: 'done-new', done: true, createdAt: 5 }),
  ];
  assert.deepEqual(tasks.sort(compareTasks).map((t) => t.title), ['sooner', 'later', 'undated', 'done-old', 'done-new']);
});

test('matchesFilters: status filter', () => {
  const open = task(), done = task({ done: true });
  assert.equal(matchesFilters(open, { status: 'all', tags: [] }), true);
  assert.equal(matchesFilters(done, { status: 'open', tags: [] }), false);
  assert.equal(matchesFilters(open, { status: 'done', tags: [] }), false);
  assert.equal(matchesFilters(done, { status: 'done', tags: [] }), true);
});

test('matchesFilters: tag filter matches ANY selected tag and combines with status', () => {
  const t = task({ tags: ['home', 'family'] });
  assert.equal(matchesFilters(t, { status: 'all', tags: ['work', 'family'] }), true);
  assert.equal(matchesFilters(t, { status: 'all', tags: ['work'] }), false);
  assert.equal(matchesFilters(task({ done: true, tags: ['work'] }), { status: 'open', tags: ['work'] }), false);
});

test('dueInfo: overdue, today, future, done, none and invalid', () => {
  const now = new Date(2026, 9, 26, 12, 0);
  assert.equal(dueInfo(task({ due: '2026-10-25T09:00' }), now).state, 'overdue');
  assert.match(dueInfo(task({ due: '2026-10-25T09:00' }), now).text, /^Overdue · /);
  assert.equal(dueInfo(task({ due: '2026-10-26T18:00' }), now).state, 'today');
  assert.match(dueInfo(task({ due: '2026-10-26T18:00' }), now).text, /^Today · /);
  assert.equal(dueInfo(task({ due: '2026-10-29T10:00' }), now).state, '');
  assert.equal(dueInfo(task({ due: '2026-10-25T09:00', done: true }), now).state, '');
  assert.equal(dueInfo(task(), now), null);
  assert.equal(dueInfo(task({ due: 'not a date' }), now), null);
});

test('dueInfo: shows the year only when it differs from now', () => {
  const now = new Date(2026, 9, 26, 12, 0);
  assert.match(dueInfo(task({ due: '2027-03-01T08:00' }), now).text, /2027/);
  assert.doesNotMatch(dueInfo(task({ due: '2026-12-01T08:00' }), now).text, /2026/);
});

test('pruneTags: drops selected tags that no task uses any more', () => {
  const tasks = [task({ tags: ['home'] }), task({ tags: ['work', 'home'] })];
  assert.deepEqual(pruneTags(['home', 'gone', 'work'], tasks), ['home', 'work']);
});

test('loadFilters: falls back to defaults on missing, corrupt or invalid storage', () => {
  const store = (value) => ({ getItem: () => value });
  assert.deepEqual(loadFilters(store(null)), { status: 'all', tags: [], priorities: [] });
  assert.deepEqual(loadFilters(store('{not json')), { status: 'all', tags: [], priorities: [] });
  assert.deepEqual(loadFilters(store('{"status":"weird","tags":[]}')), { status: 'all', tags: [], priorities: [] });
  assert.deepEqual(loadFilters(store('{"status":"open","tags":["a"]}')), { status: 'open', tags: ['a'], priorities: [] });
  assert.deepEqual(loadFilters({ getItem: () => { throw new Error('blocked'); } }), { status: 'all', tags: [], priorities: [] });
});

test('safeStorage: returns the window localStorage when accessible', () => {
  const store = { getItem: () => null, setItem() {} };
  assert.equal(safeStorage({ localStorage: store }), store);
});

test('safeStorage: blocked storage (getter throws) falls back to a no-op store', () => {
  const blocked = Object.defineProperty({}, 'localStorage', { get() { throw new Error('SecurityError: access denied'); } });
  const store = safeStorage(blocked);
  assert.equal(store.getItem('todo-filters'), null);
  assert.doesNotThrow(() => store.setItem('todo-filters', '{}'));
  // and the app's filter loading still works on top of it
  assert.deepEqual(loadFilters(store), { status: 'all', tags: [], priorities: [] });
});

test('saveFilters: writes the filters as JSON and reports success', () => {
  const saved = {};
  const store = { setItem: (k, v) => { saved[k] = v; } };
  assert.equal(saveFilters(store, { status: 'open', tags: ['a'] }), true);
  assert.deepEqual(JSON.parse(saved['todo-filters']), { status: 'open', tags: ['a'] });
});

test('saveFilters: a failing setItem (quota exceeded, blocked) is swallowed and reported', () => {
  const full = { setItem() { throw new Error('QuotaExceededError'); } };
  assert.equal(saveFilters(full, { status: 'all', tags: [] }), false);
});

test('compareTasks: open tasks by priority first (High, Medium, Low), then due date', () => {
  const tasks = [
    task({ title: 'low-soon', priority: 'low', due: '2026-10-27T09:00' }),
    task({ title: 'high-late', priority: 'high', due: '2026-12-01T09:00' }),
    task({ title: 'medium-none' }), // no priority stored -> medium
    task({ title: 'medium-soon', priority: 'medium', due: '2026-10-28T09:00' }),
    task({ title: 'done-high', priority: 'high', done: true }),
  ];
  assert.deepEqual(tasks.sort(compareTasks).map((t) => t.title), ['high-late', 'medium-soon', 'medium-none', 'low-soon', 'done-high']);
});

test('matchesFilters: priority filter matches ANY selected priority and combines with status and tags', () => {
  const t = task({ priority: 'high', tags: ['work'] });
  assert.equal(matchesFilters(t, { status: 'all', tags: [], priorities: [] }), true); // empty = all
  assert.equal(matchesFilters(t, { status: 'all', tags: [], priorities: ['high', 'low'] }), true);
  assert.equal(matchesFilters(t, { status: 'all', tags: [], priorities: ['low'] }), false);
  assert.equal(matchesFilters(t, { status: 'all', tags: ['home'], priorities: ['high'] }), false);
  assert.equal(matchesFilters(task(), { status: 'all', tags: [], priorities: ['medium'] }), true); // missing priority = medium
  assert.equal(matchesFilters(t, { status: 'all', tags: [] }), true); // older saved filters without priorities
});

test('loadFilters: restores saved priorities, dropping invalid ones', () => {
  const store = { getItem: () => '{"status":"open","tags":[],"priorities":["high","urgent",3,"low"]}' };
  assert.deepEqual(loadFilters(store), { status: 'open', tags: [], priorities: ['high', 'low'] });
});
