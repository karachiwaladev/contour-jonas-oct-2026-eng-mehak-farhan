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

const { isTrustedPR, safeEnv } = require('../evals/safety');
const { locateCode, grade } = require('../evals/coverage-eval');

test('safety: merged PRs into main are trusted (the owner already merged them)', () => {
  assert.equal(isTrustedPR({ state: 'MERGED', baseRefName: 'main', isCrossRepository: true, headRefName: 'x' }, 6, 'main'), true);
});

test('safety: open PRs run only from this repo on a ticket-<N>- branch, never from forks', () => {
  const pr = (over) => ({ state: 'OPEN', baseRefName: 'main', isCrossRepository: false, headRefName: 'ticket-6-recurring', ...over });
  assert.equal(isTrustedPR(pr(), 6, 'main'), true);
  assert.equal(isTrustedPR(pr({ isCrossRepository: true }), 6, 'main'), false); // fork
  assert.equal(isTrustedPR(pr({ headRefName: 'feature-x' }), 6, 'main'), false); // wrong branch
  assert.equal(isTrustedPR(pr({ headRefName: 'ticket-60-x' }), 6, 'main'), false); // other ticket
  assert.equal(isTrustedPR(pr({ isCrossRepository: undefined }), 6, 'main'), false); // unknown origin: refuse
  assert.equal(isTrustedPR(pr({ state: 'CLOSED' }), 6, 'main'), false);
});

test('safety: child processes get no tokens, secrets or keys', () => {
  const env = safeEnv({ PATH: '/bin', BROWSER: 'chrome', FACTORY_ROOT: '/x', CI: 'true', GH_TOKEN: 't', GITHUB_TOKEN: 't',
    ACTIONS_RUNTIME_TOKEN: 't', ACTIONS_ID_TOKEN_REQUEST_URL: 'u', NPM_TOKEN: 't', AWS_SECRET_ACCESS_KEY: 's', ANTHROPIC_API_KEY: 'k', DB_PASSWORD: 'p' });
  assert.deepEqual(Object.keys(env).sort(), ['BROWSER', 'CI', 'FACTORY_ROOT', 'PATH']);
});

test('locateCode: merged PRs on main give base = parent of first merge, head = last merge', () => {
  const prs = [
    { number: 14, state: 'MERGED', baseRefName: 'main', mergeCommit: { oid: 'bbb' }, mergedAt: '2026-10-26T10:00:00Z' },
    { number: 8, state: 'MERGED', baseRefName: 'main', mergeCommit: { oid: 'aaa' }, mergedAt: '2026-10-26T09:52:03Z' },
    { number: 13, state: 'MERGED', baseRefName: 'ticket-6-refactor', mergeCommit: { oid: 'side' }, mergedAt: '2026-10-26T09:52:13Z' },
  ];
  assert.deepEqual(locateCode(prs, 'main', 6), { commits: ['aaa', 'bbb'], base: 'aaa^1', head: 'bbb' });
});

test('locateCode: an untrusted open PR (fork) is never checked out', () => {
  const fork = { number: 99, state: 'OPEN', baseRefName: 'main', isCrossRepository: true, headRefName: 'ticket-6-evil', headRefOid: 'f00' };
  assert.equal(locateCode([fork], 'main', 6), null);
});

test('grade: higher of unit/browser coverage per file; never loaded = FAIL', () => {
  const rows = grade(['todo/a.js', 'todo/b.js', 'todo/c.js'],
    { 'todo/a.js': { lines: 70, uncovered: '5-9' }, 'todo/b.js': { lines: 100, uncovered: '' } },
    { 'todo/a.js': { lines: 92, uncovered: '12' } });
  assert.deepEqual(rows.map((r) => [r.name, r.status]), [['todo/a.js', 'PASS'], ['todo/b.js', 'PASS'], ['todo/c.js', 'FAIL']]);
  assert.match(rows[0].detail, /unit 70% · browser 92% \(uncovered lines: 12\)/);
  assert.equal(rows[2].detail, 'not loaded by any test');
});

const { unitTestCases, mergeRiskCases, toResults } = require('../evals/scoring');

test('unit-tests eval: one case per changed source file, pass when unit coverage >= 80%', () => {
  const cases = unitTestCases(['todo/a.js', 'todo/b.js', 'todo/c.js'], { 'todo/a.js': { lines: 100 }, 'todo/b.js': { lines: 60 } });
  assert.deepEqual(cases.map((c) => [c.id, c.pass]), [['todo/a.js', true], ['todo/b.js', false], ['todo/c.js', false]]);
  assert.match(cases[1].detail, /60%/);
  assert.match(cases[2].detail, /no unit test/);
});

test('merge-risk eval: safe-by-default factors pass, risky ones fail with reasons', () => {
  const f = (path, added, deleted = 0) => ({ path, added, deleted });
  const safe = mergeRiskCases({ files: [f('todo/filters.js', 40), f('todo/tests/filters.test.js', 60)], sastFindings: [] });
  assert.ok(safe.length >= 7);
  assert.ok(safe.every((c) => c.pass), JSON.stringify(safe.filter((c) => !c.pass)));
  const risky = mergeRiskCases({ files: [f('todo/db.js', 500), f('a/x.js', 1), f('b/y.js', 1), f('todo/package-lock.json', 900)], sastFindings: [{ severity: 'high' }] });
  const failed = risky.filter((c) => !c.pass).map((c) => c.id).sort();
  assert.deepEqual(failed, ['few-modules', 'no-dependency-changes', 'no-high-sast-findings', 'no-sensitive-areas', 'small-diff', 'test-ratio']);
});

test('results: score is the % of passing cases, shape matches results.json', () => {
  const r = toResults('unit-tests', 16, [{ id: 'a', pass: true, detail: 'x' }, { id: 'b', pass: false, detail: 'y' }, { id: 'c', pass: true, detail: 'z' }], { head: 'abc' });
  assert.equal(r.eval, 'unit-tests');
  assert.equal(r.ticket, 16);
  assert.equal(r.score, 67);
  assert.equal(r.passed, 2);
  assert.equal(r.total, 3);
  assert.deepEqual(r.cases[1], { id: 'b', pass: false, detail: 'y' });
  assert.equal(r.head, 'abc');
  assert.ok(!Number.isNaN(Date.parse(r.generatedAt)));
});

test('merge-risk eval: documentation is not counted as risky source', () => {
  const f = (path, added) => ({ path, added, deleted: 0 });
  const cases = mergeRiskCases({ files: [f('todo/app.js', 20), f('todo/tests/app.test.js', 20), f('CLAUDE.md', 5), f('todo/README.md', 40), f('docs/guide.txt', 9)] });
  const byId = Object.fromEntries(cases.map((c) => [c.id, c]));
  assert.match(byId['few-files'].detail, /^1 source files/);
  assert.match(byId['few-modules'].detail, /^1 module\(s\): todo /);
  assert.match(byId['small-diff'].detail, /^20 source lines/);
});
