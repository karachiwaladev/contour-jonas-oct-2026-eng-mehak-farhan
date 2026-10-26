// Pure logic of the coverage eval: parsing coverage reports, grading files, finding a ticket's PRs, the scorecard.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUnitCoverage, parseBrowserCoverage, gradeFile } = require('../evals/coverage');
const { referencesTicket } = require('../evals/github');
const { summarize, renderMarkdown } = require('../evals/report');

const NODE_REPORT = [
  '# start of coverage report',
  '# ------------------------------------------------------------------------------',
  '# file                          | line % | branch % | funcs % | uncovered lines',
  '# ------------------------------------------------------------------------------',
  '# todo\\filters.js               | 100.00 |    96.08 |  100.00 | ',
  '# todo\\recurrence.js            |  91.50 |   100.00 |  100.00 | 40-42',
  '# todo\\tests\\filters.test.js    | 100.00 |   100.00 |  100.00 | ',
  '# ------------------------------------------------------------------------------',
  '# all files                     |  97.10 |    98.26 |  100.00 |',
  '# end of coverage report',
].join('\n');

test('coverage: parses node --experimental-test-coverage output (Windows paths, skips tests and totals)', () => {
  assert.deepEqual(parseUnitCoverage(NODE_REPORT), {
    'todo/filters.js': { lines: 100, branches: 96.08, funcs: 100, uncovered: '' },
    'todo/recurrence.js': { lines: 91.5, branches: 100, funcs: 100, uncovered: '40-42' },
  });
  assert.deepEqual(parseUnitCoverage('no report here'), {});
});

test('coverage: parses the browser-coverage.js table', () => {
  const table = '| File | Lines | Covered | Uncovered lines |\n|---|---|---|---|\n| todo/app.js | ✅ 100.0% | 89/89 | - |\n| todo/db.js | ⚠️ 85.7% | 30/35 | 12, 19 |\n| **All** | 96.1% | 119/124 | |';
  assert.deepEqual(parseBrowserCoverage(table), {
    'todo/app.js': { lines: 100, covered: 89, total: 89, uncovered: '' },
    'todo/db.js': { lines: 85.7, covered: 30, total: 35, uncovered: '12, 19' },
  });
});

test('coverage: grades a file against the minimum (80) and target (90)', () => {
  assert.equal(gradeFile(95), 'PASS');
  assert.equal(gradeFile(90), 'PASS');
  assert.equal(gradeFile(85), 'WARN');
  assert.equal(gradeFile(80), 'WARN');
  assert.equal(gradeFile(79.9), 'FAIL');
  assert.equal(gradeFile(null), 'FAIL'); // a changed source file that no test ever loaded
  assert.equal(gradeFile(70, { min: 60, target: 75 }), 'WARN');
});

test('github: recognises PRs that belong to a ticket', () => {
  assert.equal(referencesTicket({ title: 'x', body: 'Closes #6' }, 6), true);
  assert.equal(referencesTicket({ title: 'x', body: 'Part of #6' }, 6), true);
  assert.equal(referencesTicket({ title: 'Ticket #6: refactor', body: '' }, 6), true);
  assert.equal(referencesTicket({ title: 'x', body: 'Closes #60' }, 6), false);
  assert.equal(referencesTicket({ title: 'Ticket #5: recurring', body: 'Closes #6' }, 5), false); // body reference wins
});

test('report: score counts PASS as 1, WARN as 0.5, FAIL as 0 and ignores SKIP', () => {
  const s = summarize([{ status: 'PASS' }, { status: 'WARN' }, { status: 'SKIP' }, { status: 'FAIL' }]);
  assert.deepEqual(s, { score: 50, counted: 3 });
});

test('report: markdown scorecard lists every file and ends with the eval marker', () => {
  const md = renderMarkdown({ ticket: 6, title: 'Recurring', prs: [{ number: 14 }], base: 'a'.repeat(40), head: 'b'.repeat(40), rows: [
    { name: 'todo/recurrence.js', status: 'PASS', detail: 'unit 100% · browser 97.6%' },
    { name: 'todo/db.js', status: 'WARN', detail: 'browser 85%' },
  ] });
  assert.match(md, /Coverage eval: #6 Recurring/);
  assert.match(md, /todo\/recurrence\.js/);
  assert.match(md, /todo\/db\.js/);
  assert.match(md, /<!-- factory:eval -->\s*$/);
});
