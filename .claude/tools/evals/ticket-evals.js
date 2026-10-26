// Runs the unit-tests and merge-risk evals for a ticket and writes their results to
//   evals/unit-tests/results.json   and   evals/merge-risk/results.json
// as { score, cases: [{ id, pass, detail }], ... }. The factory loop runs this after every build and commits the files.
// Same trust rules as the coverage eval: only merged PRs or trusted open PRs (this repo, ticket-<N>- branch).
// Usage: node .claude/tools/evals/ticket-evals.js <ticket>
const fs = require('fs');
const path = require('path');
const github = require('./github');
const wt = require('./worktree');
const sast = require('../sast-scan');
const { locateCode, changedSources, unitCoverage } = require('./coverage-eval');
const { unitTestCases, mergeRiskCases, toResults } = require('./scoring');

function write(name, results) {
  const file = path.join(wt.root, 'evals', name, 'results.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(results, null, 2) + '\n');
  return path.relative(wt.root, file).split(path.sep).join('/');
}

function main() {
  const n = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)));
  if (!n) { console.error('Usage: node .claude/tools/evals/ticket-evals.js <ticket>'); return 2; }
  const prs = github.ticketPRs(n);
  wt.git(['fetch', '-q', 'origin']);
  const code = locateCode(prs, github.defaultBranch(), n);
  if (!code) { console.log(`Ticket #${n}: no merged PR or trusted open PR, so there is nothing to evaluate.`); return 0; }
  const headDir = wt.addWorktree(code.head);
  try {
    const files = wt.changedFiles(code);
    const sources = changedSources(code, headDir);
    const projects = [...new Set(sources.map((s) => s.split('/')[0]))];
    const meta = { prs: prs.map((p) => p.number), head: code.head };
    const unit = toResults('unit-tests', n, unitTestCases(sources, unitCoverage(headDir, projects)), meta);
    const findings = sast.scanFiles(sources.map((s) => path.join(headDir, s)));
    const riskCases = mergeRiskCases({ files, sastFindings: findings });
    const failed = riskCases.filter((c) => !c.pass).length;
    const risk = toResults('merge-risk', n, riskCases, { ...meta, level: failed >= 4 ? 'High' : failed >= 2 ? 'Medium' : 'Low' });
    const out = [write('unit-tests', unit), write('merge-risk', risk)];
    console.log(`## Evals for ticket #${n} (code at ${code.head.slice(0, 7)})\n`);
    for (const r of [unit, risk]) {
      console.log(`### ${r.eval}: ${r.score}/100 (${r.passed}/${r.total} cases pass)${r.level ? ` · risk ${r.level}` : ''}\n`);
      for (const c of r.cases) console.log(`- ${c.pass ? '✅' : '❌'} ${c.id}: ${c.detail}`);
      console.log('');
    }
    console.log(`Wrote ${out.join(' and ')}.`);
  } finally {
    wt.removeWorktree(headDir);
  }
  return 0;
}

if (require.main === module) process.exitCode = main();
