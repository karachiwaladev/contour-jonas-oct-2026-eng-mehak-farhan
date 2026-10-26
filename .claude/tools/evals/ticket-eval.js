// Ticket eval: scores a finished ticket on Engineering (tests written, fail-to-pass, no regressions, PR risk)
// and QA (acceptance checks verified, screenshots, browser tests, coverage, golden set). Runs after a ticket
// closes (GitHub Actions) or by hand. Uses temporary git worktrees, so the working checkout is never touched.
// Usage: node .claude/tools/evals/ticket-eval.js <ticket> [--post] [--quick] [--json <file>]
//   --post   post the scorecard on the ticket     --quick  skip browser tests and coverage
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const github = require('./github');
const wt = require('./worktree');
const { scoreRisk } = require('./risk');
const qa = require('./qa');
const { runGolden } = require('./golden');
const { renderMarkdown, summarize } = require('./report');
const { findNode, findTestFiles } = require('../run-tests');
const sast = require('../sast-scan');

const args = process.argv.slice(2);
const N = Number(args.find((a) => /^\d+$/.test(a)));
const POST = args.includes('--post'), QUICK = args.includes('--quick');
const JSON_OUT = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const TOOLS = path.join(wt.root, '.claude', 'tools');
const TEST = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/i;
const IGNORED = /(^|\/)screenshots\/|^\.claude\/prompts\.jsonl$/;
const checks = [];
const check = (area, name, status, detail) => checks.push({ area, name, status, detail });

// Where the ticket's code landed: squash-merge commits on the default branch, else the latest open PR's head.
function locateCode(prs, mainBranch) {
  const merged = prs.filter((p) => p.state === 'MERGED' && p.baseRefName === mainBranch && p.mergeCommit)
    .sort((a, b) => a.mergedAt.localeCompare(b.mergedAt));
  if (merged.length) {
    const commits = merged.map((p) => p.mergeCommit.oid);
    return { commits, base: `${commits[0]}^1`, head: commits[commits.length - 1] };
  }
  const open = prs.filter((p) => p.state === 'OPEN');
  if (!open.length) return null;
  const pr = open[open.length - 1];
  wt.git(['fetch', '-q', 'origin', `pull/${pr.number}/head`]);
  return { commits: null, base: wt.git(['merge-base', `origin/${mainBranch}`, pr.headRefOid]), head: pr.headRefOid };
}

function engineering({ files, baseDir, headDir, code, node }) {
  const source = files.filter((f) => !TEST.test(f.path) && !IGNORED.test(f.path) && /\.[cm]?[jt]sx?$/.test(f.path));
  const tests = files.filter((f) => TEST.test(f.path));
  if (!source.length) check('Engineering', 'Unit tests written', 'SKIP', 'no source code changed');
  else check('Engineering', 'Unit tests written', tests.length ? 'PASS' : 'FAIL',
    tests.length ? `${tests.length} test file(s) added/changed for ${source.length} source file(s)` : `${source.length} source file(s) changed with no test changes`);

  const f2p = node ? wt.failToPass({ node, baseDir, headDir, head: code.head, testFiles: tests.map((t) => t.path) }) : [];
  if (!f2p.length) check('Engineering', 'Tests fail before, pass after (fail-to-pass)', source.length ? 'WARN' : 'SKIP', node ? 'no unit-test files changed' : 'no Node 18+ available');
  else {
    const bad = f2p.filter((r) => !r.passesAfter), weak = f2p.filter((r) => r.passesAfter && !r.failsBefore);
    check('Engineering', 'Tests fail before, pass after (fail-to-pass)', bad.length ? 'FAIL' : weak.length ? 'WARN' : 'PASS',
      f2p.map((r) => `${path.basename(r.file)}: before ${r.failsBefore ? 'fails ✓' : 'passes ✗'}, after ${r.passesAfter ? 'passes ✓' : 'fails ✗'}`).join('; ') +
      (weak.length ? ' (a test that already passed before the ticket does not prove the new behaviour)' : ''));
  }

  const all = node ? findTestFiles([], headDir) : [];
  if (!all.length) check('Engineering', 'Full unit suite passes (no regressions)', 'SKIP', 'no unit tests at the ticket head');
  else {
    const r = spawnSync(node, ['--test', ...all], { cwd: headDir, encoding: 'utf8' });
    const m = /# pass (\d+)[\s\S]*# fail (\d+)/.exec(`${r.stdout}${r.stderr}`);
    check('Engineering', 'Full unit suite passes (no regressions)', r.status === 0 ? 'PASS' : 'FAIL', m ? `${m[1]} passed, ${m[2]} failed` : 'could not run');
  }

  const findings = sast.scanFiles(source.map((f) => path.join(headDir, f.path)).filter((p) => fs.existsSync(p)));
  const risk = scoreRisk({ files, sastFindings: findings });
  check('Engineering', 'PR risk', risk.level === 'High' ? 'WARN' : 'PASS', `${risk.level} (${risk.score}/100): ${risk.reasons.join('; ') || 'no risk factors'}`);
  return risk;
}

function qaChecks({ ticket, prs, files, headDir }) {
  const plan = github.latestPlan(ticket);
  const planned = qa.parseAcceptanceChecks(plan);
  const table = prs.reduce((acc, p) => { const t = qa.parseChecksTable(p.body); return { passed: [...acc.passed, ...t.passed], failed: [...acc.failed, ...t.failed] }; }, { passed: [], failed: [] });
  if (!planned.length) check('QA', 'Acceptance checks verified', table.passed.length ? 'WARN' : 'SKIP', plan ? 'plan has no numbered acceptance checks' : 'no factory plan on the ticket');
  else {
    const missing = planned.filter((n) => !table.passed.includes(n)), failed = planned.filter((n) => table.failed.includes(n));
    check('QA', 'Acceptance checks verified', failed.length ? 'FAIL' : missing.length ? 'WARN' : 'PASS',
      `${planned.length - missing.length}/${planned.length} plan checks marked ✅ in the PRs` + (missing.length ? `; not shown as verified: ${missing.join(', ')}` : '') + (failed.length ? `; ❌: ${failed.join(', ')}` : ''));
  }

  const ui = files.some((f) => /\.(html|css)$/.test(f.path) || /(render|app|ui)\.[jt]s$/.test(f.path));
  const images = [ticket.body, ...ticket.comments.map((c) => c.body), ...prs.map((p) => p.body)].flatMap(qa.findImages);
  const inRepo = images.filter((i) => i.path), resolved = inRepo.filter((i) => { try { wt.git(['cat-file', '-e', `${i.sha}:${i.path}`]); return true; } catch { return false; } });
  check('QA', 'Screenshots attached', !ui ? 'SKIP' : resolved.length ? (resolved.length === inRepo.length ? 'PASS' : 'WARN') : 'FAIL',
    !ui ? 'no UI change' : `${new Set(resolved.map((i) => i.path)).size} distinct screenshot(s) in the repo` + (inRepo.length > resolved.length ? `; ${inRepo.length - resolved.length} link(s) don't resolve` : ''));

  const projects = [...new Set(files.map((f) => f.path.split('/')[0]).filter((d) => !d.startsWith('.') && fs.existsSync(path.join(headDir, d)) && fs.statSync(path.join(headDir, d)).isDirectory()))];
  runBrowserChecks(headDir, projects);

  const golden = projects.filter((p) => fs.existsSync(path.join(wt.root, p, 'tests', 'golden')));
  if (!golden.length) check('QA', 'Golden set (edge cases)', 'SKIP', 'no golden set for the touched projects');
  for (const p of golden) {
    const g = runGolden(path.join(wt.root, p), path.join(headDir, p));
    const fails = g.results.filter((r) => !r.ok).map((r) => r.id);
    check('QA', `Golden set: ${p}/`, fails.length ? 'FAIL' : 'PASS', `${g.passed}/${g.total} cases pass` + (fails.length ? `; failing: ${fails.join(', ')}` : ''));
  }
}

function runBrowserChecks(headDir, projects) {
  const pages = projects.some((p) => fs.existsSync(path.join(headDir, p, 'tests', 'browser')));
  const harness = fs.existsSync(path.join(headDir, '.claude', 'tools', 'browser-harness.js'));
  if (QUICK || !pages || !harness) {
    const why = QUICK ? 'skipped (--quick)' : !pages ? 'no browser tests' : 'ticket head predates the browser harness';
    check('QA', 'Browser tests pass', 'SKIP', why);
    check('QA', 'Browser coverage ≥ 80% per file', 'SKIP', why);
    return;
  }
  const env = { ...process.env, FACTORY_ROOT: headDir };
  const bt = spawnSync(process.execPath, [path.join(TOOLS, 'browser-test.js')], { env, encoding: 'utf8', timeout: 300000 });
  const pass = (bt.stdout.match(/^\s+PASS /gm) || []).length, fail = (bt.stdout.match(/^\s+FAIL /gm) || []).length;
  check('QA', 'Browser tests pass', bt.status === 0 ? 'PASS' : 'FAIL', `${pass} passed, ${fail} failed`);
  const cov = spawnSync(process.execPath, [path.join(TOOLS, 'browser-coverage.js'), '--min', '80'], { env, encoding: 'utf8', timeout: 300000 });
  const all = /\*\*All\*\* \| ([\d.]+)%/.exec(cov.stdout), low = cov.stdout.split('\n').filter((l) => l.includes('❌')).map((l) => l.split('|')[1].trim());
  check('QA', 'Browser coverage ≥ 80% per file', cov.status === 0 ? 'PASS' : 'FAIL', all ? `${all[1]}% of lines overall` + (low.length ? `; below 80%: ${low.join(', ')}` : '') : 'could not measure');
}

function main() {
  if (!N) { console.error('Usage: node .claude/tools/evals/ticket-eval.js <ticket> [--post] [--quick] [--json <file>]'); return 2; }
  const ticket = github.getTicket(N), prs = github.ticketPRs(N), mainBranch = github.defaultBranch();
  wt.git(['fetch', '-q', 'origin']);
  const code = locateCode(prs, mainBranch);
  let risk = null, baseDir = null, headDir = null;
  try {
    if (!code) check('Engineering', 'Ticket code located', 'FAIL', 'no merged or open PR references this ticket');
    else {
      baseDir = wt.addWorktree(wt.git(['rev-parse', code.base]));
      headDir = wt.addWorktree(code.head);
      const files = wt.changedFiles(code);
      const node = (findNode(18) || {}).exe;
      risk = engineering({ files, baseDir, headDir, code, node });
      qaChecks({ ticket, prs, files, headDir });
    }
  } finally {
    if (baseDir) wt.removeWorktree(baseDir);
    if (headDir) wt.removeWorktree(headDir);
  }
  const md = renderMarkdown({ ticket: N, title: ticket.title, prs, checks, risk, base: code && wt.git(['rev-parse', code.base]), head: code && code.head });
  console.log(md);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ ticket: N, summary: summarize(checks), risk, checks }, null, 2));
  if (POST) {
    const file = path.join(os.tmpdir(), `ticket-${N}-eval.md`);
    fs.writeFileSync(file, md);
    github.postComment(N, file);
  }
  return checks.some((c) => c.status === 'FAIL') ? 1 : 0;
}

process.exitCode = main();
