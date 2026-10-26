// Coverage eval: after a ticket, checks out the ticket's final code in a temporary git worktree, measures unit and
// browser coverage there, and grades every source file the ticket changed (≥ 80% required, 90% target).
// Runs when a ticket closes (GitHub Actions) or by hand. The working checkout is never touched.
// Usage: node .claude/tools/evals/coverage-eval.js <ticket> [--post] [--unit-only] [--json <file>]
//   --post       post the scorecard on the ticket
//   --unit-only  skip browser coverage (faster; unit coverage only)
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const github = require('./github');
const wt = require('./worktree');
const { parseUnitCoverage, parseBrowserCoverage, gradeFile, TEST } = require('./coverage');
const { renderMarkdown, summarize } = require('./report');
const { findNode, findTestFiles } = require('../run-tests');

const args = process.argv.slice(2);
const N = Number(args.find((a) => /^\d+$/.test(a)));
const POST = args.includes('--post'), UNIT_ONLY = args.includes('--unit-only');
const JSON_OUT = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const SOURCE = /\.[cm]?[jt]sx?$/;

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

// Project source files the ticket changed (not tests, not factory tooling or CI), still present at the head.
function changedSources(code, headDir) {
  return wt.changedFiles(code).map((f) => f.path)
    .filter((p) => SOURCE.test(p) && !TEST.test(p) && !p.startsWith('.') && p.includes('/') && fs.existsSync(path.join(headDir, p)));
}

function unitCoverage(headDir, projects) {
  const node = findNode(18);
  const files = node ? findTestFiles(projects.map((p) => path.join(headDir, p, 'tests')), headDir) : [];
  if (!files.length) return {};
  const r = spawnSync(node.exe, ['--test', '--experimental-test-coverage', ...files], { cwd: headDir, encoding: 'utf8' });
  return parseUnitCoverage(`${r.stdout}${r.stderr}`);
}

function browserCoverage(headDir, projects) {
  const hasPages = projects.some((p) => fs.existsSync(path.join(headDir, p, 'tests', 'browser')));
  if (UNIT_ONLY || !hasPages) return {};
  const tool = path.join(wt.root, '.claude', 'tools', 'browser-coverage.js');
  const r = spawnSync(process.execPath, [tool, '--min', '0'], { env: { ...process.env, FACTORY_ROOT: headDir }, encoding: 'utf8', timeout: 300000 });
  return parseBrowserCoverage(r.stdout || '');
}

function grade(sources, unit, browser) {
  return sources.map((file) => {
    const u = unit[file], b = browser[file];
    const best = Math.max(u ? u.lines : -1, b ? b.lines : -1);
    const parts = [u && `unit ${u.lines}%`, b && `browser ${b.lines}%`].filter(Boolean);
    const gaps = (b && b.lines >= (u ? u.lines : -1) ? b.uncovered : u && u.uncovered) || '';
    return {
      name: file,
      status: gradeFile(best < 0 ? null : best),
      detail: parts.length ? parts.join(' · ') + (gaps ? ` (uncovered lines: ${gaps})` : '') : 'not loaded by any test',
    };
  });
}

function main() {
  if (!N) { console.error('Usage: node .claude/tools/evals/coverage-eval.js <ticket> [--post] [--unit-only] [--json <file>]'); return 2; }
  const ticket = github.getTicket(N), prs = github.ticketPRs(N);
  wt.git(['fetch', '-q', 'origin']);
  const code = locateCode(prs, github.defaultBranch());
  const notes = [];
  let rows = [], headDir = null;
  try {
    if (!code) notes.push('No merged or open PR references this ticket, so there is no ticket code to measure.');
    else {
      headDir = wt.addWorktree(code.head);
      const sources = changedSources(code, headDir);
      const projects = [...new Set(sources.map((s) => s.split('/')[0]))];
      if (!sources.length) notes.push('The ticket changed no project source files.');
      else rows = grade(sources, unitCoverage(headDir, projects), browserCoverage(headDir, projects));
      if (UNIT_ONLY) notes.push('Browser coverage skipped (--unit-only).');
      notes.push('Per file, the higher of unit and browser line coverage is graded.');
    }
  } finally {
    if (headDir) wt.removeWorktree(headDir);
  }
  const base = code ? wt.git(['rev-parse', code.base]) : null;
  const md = renderMarkdown({ ticket: N, title: ticket.title, prs, rows, base, head: code && code.head, notes });
  console.log(md);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ ticket: N, summary: summarize(rows), rows }, null, 2));
  if (POST) {
    const file = path.join(os.tmpdir(), `ticket-${N}-coverage-eval.md`);
    fs.writeFileSync(file, md);
    github.postComment(N, file);
  }
  return !code || rows.some((r) => r.status === 'FAIL') ? 1 : 0;
}

module.exports = { locateCode, grade };

if (require.main === module) process.exitCode = main();
