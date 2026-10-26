// Pure logic of the ticket evals: risk scoring, QA evidence parsing, golden-set evaluation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreRisk } = require('../evals/risk');
const { parseAcceptanceChecks, parseChecksTable, findImages, referencesTicket } = require('../evals/qa');
const { evaluateCase, revive } = require('../evals/golden');

const f = (path, added, deleted = 0) => ({ path, added, deleted });

test('risk: a small, well-tested change in one module is Low', () => {
  const r = scoreRisk({ files: [f('todo/filters.js', 40), f('todo/tests/filters.test.js', 60)] });
  assert.equal(r.level, 'Low');
  assert.ok(r.score < 25, `score ${r.score}`);
});

test('risk: big, untested, multi-module change touching storage and CI is High, with reasons', () => {
  const r = scoreRisk({
    files: [f('todo/db.js', 300, 50), f('todo/app.js', 250), f('notes/x.js', 100), f('.github/workflows/ci.yml', 20), f('todo/a.js', 1), f('todo/b.js', 1)],
    sastFindings: [{ severity: 'high' }],
  });
  assert.equal(r.level, 'High');
  for (const word of ['lines', 'modules', 'storage', 'CI', 'test', 'SAST']) {
    assert.ok(r.reasons.some((x) => x.includes(word)), `missing reason about ${word}: ${r.reasons.join(' | ')}`);
  }
});

test('risk: tests, screenshots and the prompt log do not count as risky source lines', () => {
  const r = scoreRisk({ files: [f('todo/recurrence.js', 50), f('todo/tests/recurrence.test.js', 900), f('todo/screenshots/a.png', 0), f('.claude/prompts.jsonl', 500)] });
  assert.equal(r.level, 'Low');
  assert.equal(r.sourceLines, 50);
});

test('risk: new dependencies add risk', () => {
  const base = scoreRisk({ files: [f('todo/app.js', 30), f('todo/tests/a.test.js', 30)] }).score;
  const withDeps = scoreRisk({ files: [f('todo/app.js', 30), f('todo/tests/a.test.js', 30), f('todo/package-lock.json', 400)] }).score;
  assert.ok(withDeps > base);
});

test('qa: parses the numbered acceptance checks from a factory plan', () => {
  const plan = '**Design:** x\n\n**Acceptance checks (verified in the browser):**\n1. First thing\n2. Second\n9. Ninth\n\n**Test plan:**\n1. not a check';
  assert.deepEqual(parseAcceptanceChecks(plan), [1, 2, 9]);
  assert.deepEqual(parseAcceptanceChecks('no plan here'), []);
});

test('qa: reads passed and failed rows from a PR acceptance-check table', () => {
  const body = '| # | Check | Result | How |\n|---|---|---|---|\n| 1 | a | ✅ | unit |\n| 2 | b | ❌ | - |\n| 8 (from the plan) | c | ✅ | browser |\n| – | d | ✅ | x |';
  assert.deepEqual(parseChecksTable(body), { passed: [1, 8], failed: [2] });
});

test('qa: finds embedded images and their repo paths', () => {
  const md = 'x ![shot](https://github.com/o/r/blob/abc123/todo/screenshots/a.png?raw=true) y ![ext](https://example.com/b.png)';
  assert.deepEqual(findImages(md), [
    { alt: 'shot', url: 'https://github.com/o/r/blob/abc123/todo/screenshots/a.png?raw=true', sha: 'abc123', path: 'todo/screenshots/a.png' },
    { alt: 'ext', url: 'https://example.com/b.png', sha: null, path: null },
  ]);
});

test('qa: recognises PRs that belong to a ticket', () => {
  assert.equal(referencesTicket({ title: 'x', body: 'Closes #6' }, 6), true);
  assert.equal(referencesTicket({ title: 'x', body: 'Part of #6' }, 6), true);
  assert.equal(referencesTicket({ title: 'Ticket #6: refactor', body: '' }, 6), true);
  assert.equal(referencesTicket({ title: 'x', body: 'Closes #60' }, 6), false);
  assert.equal(referencesTicket({ title: 'Ticket #5: recurring', body: 'Closes #6' }, 5), false); // title numbering is the workshop's, body wins
});

test('golden: evaluates a pure-function case and reports actual vs expected', () => {
  const mod = { add: (a, b) => a + b };
  assert.deepEqual(evaluateCase({ id: 'ok', fn: 'add', args: [1, 2], expect: 3 }, mod), { id: 'ok', ok: true, actual: 3, expected: 3 });
  assert.equal(evaluateCase({ id: 'bad', fn: 'add', args: [1, 2], expect: 4 }, mod).ok, false);
  assert.equal(evaluateCase({ id: 'missing', fn: 'nope', args: [], expect: 1 }, mod).ok, false);
});

test('golden: {"$date": ...} arguments become local Date objects', () => {
  const d = revive({ $date: '2026-10-26T12:30' });
  assert.ok(d instanceof Date);
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2026, 9, 26, 12, 30]);
  assert.deepEqual(revive([1, { $date: '2026-01-01T00:00' }])[0], 1);
});

const { summarize, renderMarkdown } = require('../evals/report');

test('report: area score counts PASS as 1, WARN as 0.5, FAIL as 0 and ignores SKIP', () => {
  const s = summarize([
    { area: 'Engineering', status: 'PASS' }, { area: 'Engineering', status: 'WARN' }, { area: 'Engineering', status: 'SKIP' },
    { area: 'QA', status: 'FAIL' }, { area: 'QA', status: 'PASS' },
  ]);
  assert.deepEqual(s.Engineering, { score: 75, counted: 2 });
  assert.deepEqual(s.QA, { score: 50, counted: 2 });
  assert.equal(s.overall, 63); // 2.5 of 4 counted checks
});

test('report: markdown scorecard lists every check and ends with the eval marker', () => {
  const md = renderMarkdown({ ticket: 6, title: 'Recurring', prs: [{ number: 14, url: 'u' }], checks: [
    { area: 'Engineering', name: 'Unit tests written', status: 'PASS', detail: '2 test files' },
    { area: 'QA', name: 'Golden set', status: 'FAIL', detail: '26/27' },
  ], risk: { level: 'Low', score: 10, reasons: ['x (+10)'] } });
  assert.match(md, /Unit tests written/);
  assert.match(md, /Golden set/);
  assert.match(md, /Risk: \*\*Low\*\*/);
  assert.match(md, /<!-- factory:eval -->\s*$/);
});
