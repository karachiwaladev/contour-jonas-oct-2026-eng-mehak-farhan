// Coverage eval: after a ticket, checks out the ticket's final code in a temporary git worktree, measures unit and
// browser coverage there, and grades every source file the ticket changed (≥ 80% required, 90% target).
// Runs when a ticket closes (GitHub Actions) or by hand. The working checkout is never touched.
// Usage: node .claude/tools/evals/coverage-eval.js <ticket> [--post] [--unit-only] [--json <file>] [--md <file>]
//   --post       post the scorecard on the ticket (by hand; CI posts from a separate job, see coverage-eval.yml)
//   --unit-only  skip browser coverage (faster; unit coverage only)
//   --md         also write the scorecard markdown to a file
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const github = require('./github');
const wt = require('./worktree');
const { parseUnitCoverage, parseBrowserCoverage, gradeFile, TEST } = require('./coverage');
const { renderMarkdown, summarize } = require('./report');
const { findNode, findTestFiles } = require('../run-tests');
const { isTrustedPR, safeEnv } = require('./safety');

function parseArgs(argv) {
  const value = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null);
  return { n: Number(argv.find((a) => /^\d+$/.test(a))) || 0, post: argv.includes('--post'),
    unitOnly: argv.includes('--unit-only'), jsonOut: value('--json'), mdOut: value('--md') };
}

const { n: N, post: POST, unitOnly: UNIT_ONLY, jsonOut: JSON_OUT, mdOut: MD_OUT } = parseArgs(process.argv.slice(2));
const SOURCE = /\.[cm]?[jt]sx?$/;

// Where the ticket's code landed: squash-merge commits on the default branch, else the latest TRUSTED open PR's
// head (this repo, ticket-<N>- branch; see safety.js). Fork PRs are never fetched or run.
function locateCode(prs, mainBranch, n) {
  const trusted = prs.filter((p) => isTrustedPR(p, n, mainBranch));
  const merged = trusted.filter((p) => p.state === 'MERGED' && p.mergeCommit)
    .sort((a, b) => a.mergedAt.localeCompare(b.mergedAt));
  if (merged.length) {
    const commits = merged.map((p) => p.mergeCommit.oid);
    return { commits, base: `${commits[0]}^1`, head: commits[commits.length - 1] };
  }
  const open = trusted.filter((p) => p.state === 'OPEN');
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
  const r = spawnSync(node.exe, ['--test', '--experimental-test-coverage', ...files], { cwd: headDir, env: safeEnv(), encoding: 'utf8' });
  return parseUnitCoverage(`${r.stdout}${r.stderr}`);
}

function browserCoverage(headDir, projects, notes) {
  const hasPages = projects.some((p) => fs.existsSync(path.join(headDir, p, 'tests', 'browser')));
  if (UNIT_ONLY || !hasPages) return {};
  const tool = path.join(wt.root, '.claude', 'tools', 'browser-coverage.js');
  const r = spawnSync(process.execPath, [tool, '--min', '0'], { env: { ...safeEnv(), FACTORY_ROOT: headDir }, encoding: 'utf8', timeout: 300000 });
  const data = parseBrowserCoverage(r.stdout || '');
  if (!Object.keys(data).length) {
    const why = r.error ? r.error.message : `exit ${r.status}`;
    const out = `${r.stderr || ''}${r.stdout || ''}`.trim().split('\n');
    const msg = (out.find((l) => /error|failed|timed out|not found/i.test(l) && !/^\s+at /.test(l)) || out[0] || 'no output').trim().slice(0, 160);
    notes.push(`Browser coverage could not be measured (${why}: ${msg}). Files only the browser loads show as not covered.`);
  }
  return data;
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
  if (!N) { console.error('Usage: node .claude/tools/evals/coverage-eval.js <ticket> [--post] [--unit-only] [--json <file>] [--md <file>]'); return 2; }
  const ticket = github.getTicket(N), prs = github.ticketPRs(N);
  wt.git(['fetch', '-q', 'origin']);
  const code = locateCode(prs, github.defaultBranch(), N);
  // Nothing to measure (e.g. a question ticket, or only an untrusted fork PR): say so locally, never post or fail.
  if (!code) {
    console.log(`Ticket #${N}: no merged PR or trusted open PR (this repo, ticket-${N}- branch), so there is no ticket code to measure.`);
    return 0;
  }
  const notes = [];
  let rows = [], headDir = null;
  try {
    headDir = wt.addWorktree(code.head);
    const sources = changedSources(code, headDir);
    const projects = [...new Set(sources.map((s) => s.split('/')[0]))];
    if (!sources.length) {
      console.log(`Ticket #${N}: its PRs changed no project source files, so there is no coverage to grade.`);
      return 0;
    }
    {
      rows = grade(sources, unitCoverage(headDir, projects), browserCoverage(headDir, projects, notes));
      if (UNIT_ONLY) notes.push('Browser coverage skipped (--unit-only).');
      notes.push('Per file, the higher of unit and browser line coverage is graded.');
    }
  } finally {
    if (headDir) wt.removeWorktree(headDir);
  }
  const base = wt.git(['rev-parse', code.base]);
  const md = renderMarkdown({ ticket: N, title: ticket.title, prs, rows, base, head: code.head, notes });
  console.log(md);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ ticket: N, summary: summarize(rows), rows }, null, 2));
  if (MD_OUT) fs.writeFileSync(MD_OUT, md);
  if (POST) {
    const file = path.join(os.tmpdir(), `ticket-${N}-coverage-eval.md`);
    fs.writeFileSync(file, md);
    github.postComment(N, file);
  }
  return rows.some((r) => r.status === 'FAIL') ? 1 : 0;
}

module.exports = { locateCode, grade, changedSources, unitCoverage, parseArgs };

if (require.main === module) process.exitCode = main();
