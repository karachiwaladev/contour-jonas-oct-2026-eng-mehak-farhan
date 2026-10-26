// Factory quality gate: run before every PR (and in CI). Prints a markdown table and exits 1 on any FAIL.
// Usage: node .claude/tools/quality-gate.js [--base main] [--all]
//   --base <ref>  compare against this ref (default: main, or origin/main when main is missing)
//   --all         check every tracked file instead of only the changed ones
// External tools (gitleaks, osv-scanner, eslint) are used when installed. Otherwise a built-in fallback
// runs or the check is skipped, and the table says which.
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { scanFiles } = require('./secret-scan');
const sast = require('./sast-scan');
const { findNode, findTestFiles } = require('./run-tests');

const args = process.argv.slice(2);
const ALL = args.includes('--all');
const root = git('rev-parse', '--show-toplevel');
process.chdir(root);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : pickBase();

const LIMITS = { code: { warn: 200, fail: 300 }, markup: { warn: 400, fail: 600 }, diffLines: 400 };
const CODE = /\.(m?js|cjs|jsx|ts|tsx|py|go|rb|java|cs)$/i;
const MARKUP = /\.(html|css|scss|vue|svelte)$/i;
const IGNORED = /(^|\/)(node_modules|dist|build|screenshots|vendor)\/|\.min\.(js|css)$|^\.claude\/prompts\.jsonl$/;
const TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/i;
const LOCKFILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'requirements.txt', 'poetry.lock', 'go.sum', 'Cargo.lock'];

const results = [];
const add = (check, status, detail) => results.push({ check, status, detail });

function git(...a) { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
function tryGit(...a) { try { return git(...a); } catch { return ''; } }
function has(cmd) { return spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0; }
function run(cmd, cmdArgs, cwd) {
  // Windows needs a shell only for npm/.cmd shims; a shell breaks real executables whose paths have spaces.
  const shell = process.platform === 'win32' && (cmd === 'npm' || /\.cmd$/i.test(cmd));
  const r = spawnSync(cmd, cmdArgs, { cwd, encoding: 'utf8', shell });
  return { ok: r.status === 0, status: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}
function lastLine(text) { return (text.split('\n').filter(Boolean).pop() || '').slice(0, 160); }
function pickBase() { return tryGit('rev-parse', '--verify', '-q', 'main') ? 'main' : 'origin/main'; }

function changedFiles() {
  const lines = ALL
    ? tryGit('ls-files').split('\n')
    : [
        ...tryGit('diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`).split('\n'),
        ...tryGit('diff', '--name-only', '--diff-filter=ACMR', 'HEAD').split('\n'),
        ...tryGit('ls-files', '--others', '--exclude-standard').split('\n'),
      ];
  return [...new Set(lines.filter(Boolean))].filter((f) => fs.existsSync(f));
}

// Top-level project folders touched by the change (per CLAUDE.md: one folder per project).
function projectsOf(files) {
  return [...new Set(files.map((f) => f.split('/')[0]).filter((d) => !d.startsWith('.') && fs.existsSync(d) && fs.statSync(d).isDirectory()))];
}

function checkSyntax(files) {
  const js = files.filter((f) => /\.(m?js|cjs)$/.test(f) && !IGNORED.test(f));
  if (!js.length) return add('Syntax', 'SKIP', 'no JavaScript changed');
  const bad = js.filter((f) => !run(process.execPath, ['--check', f]).ok);
  add('Syntax', bad.length ? 'FAIL' : 'PASS', bad.length ? `syntax errors: ${bad.join(', ')}` : `${js.length} JS file(s) parse`);
}

function checkFileSize(files) {
  const over = [];
  for (const f of files) {
    if (IGNORED.test(f) || TEST_FILE.test(f)) continue;
    const limit = CODE.test(f) ? LIMITS.code : MARKUP.test(f) ? LIMITS.markup : null;
    if (!limit) continue;
    const text = fs.readFileSync(f, 'utf8'), n = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    if (n > limit.warn) over.push({ f, n, fail: n > limit.fail });
  }
  const fails = over.filter((o) => o.fail);
  const detail = over.map((o) => `${o.f} (${o.n} lines)`).join(', ');
  if (fails.length) add('File size (no god files)', 'FAIL', `split these: ${detail}`);
  else if (over.length) add('File size (no god files)', 'WARN', `getting large: ${detail}`);
  else add('File size (no god files)', 'PASS', `code ≤ ${LIMITS.code.warn} lines, markup ≤ ${LIMITS.markup.warn}`);
}

function checkTests(files, projects) {
  if (!projects.length) return add('Tests', 'SKIP', 'no project folders changed');
  const node = findNode(18);
  for (const p of projects) {
    const pkgPath = path.join(p, 'package.json');
    const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : null;
    const srcChanged = files.some((f) => f.startsWith(p + '/') && CODE.test(f) && !TEST_FILE.test(f));
    const testsChanged = files.some((f) => f.startsWith(p + '/') && TEST_FILE.test(f));
    let status;
    let detail;
    if (pkg && pkg.scripts && pkg.scripts.test) {
      const r = run('npm', ['test', '--silent'], p);
      status = r.ok ? 'PASS' : 'FAIL';
      detail = `npm test: ${r.ok ? 'passed' : lastLine(r.out)}`;
    } else if (findTestFiles([path.join(p, 'tests')]).length) {
      const testFiles = findTestFiles([path.join(p, 'tests')]);
      if (!node) { status = 'WARN'; detail = 'tests found but no Node 18+ available (set FACTORY_NODE)'; }
      else {
        const r = run(node.exe, ['--test', ...testFiles]);
        const summary = (/# pass (\d+)[\s\S]*# fail (\d+)/.exec(r.out) || []).slice(1);
        status = r.ok ? 'PASS' : 'FAIL';
        detail = `node --test (Node ${node.major}): ${summary.length ? `${summary[0]} passed, ${summary[1]} failed` : lastLine(r.out)}`;
      }
    } else { status = 'WARN'; detail = 'no automated tests (TDD expects tests)'; }
    if (status === 'PASS' && srcChanged && !testsChanged) { status = 'WARN'; detail += '; source changed without test changes'; }
    add(`Tests: ${p}/`, status, detail);
  }
}

function checkLint(projects) {
  for (const p of projects) {
    const local = path.join(p, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
    const configured = fs.readdirSync(p).some((f) => /^(\.eslintrc(\..+)?|eslint\.config\.[cm]?js)$/.test(f));
    if (!configured) { add(`Lint: ${p}/`, 'SKIP', 'no ESLint config'); continue; }
    if (!fs.existsSync(local)) { add(`Lint: ${p}/`, 'WARN', 'ESLint configured but not installed (npm install)'); continue; }
    const r = run(local, ['.'], p);
    add(`Lint: ${p}/`, r.ok ? 'PASS' : 'FAIL', r.ok ? 'eslint clean' : lastLine(r.out));
  }
}

function checkSecrets(files) {
  if (has('gitleaks')) {
    const r = run('gitleaks', ['detect', '--source', '.', '--no-banner', '--redact', '--exit-code', '1']);
    return add('Secrets', r.ok ? 'PASS' : 'FAIL', r.ok ? 'gitleaks: no leaks (working tree + history)' : `gitleaks: ${lastLine(r.out)}`);
  }
  const findings = scanFiles(files.filter((f) => !IGNORED.test(f)));
  add('Secrets', findings.length ? 'FAIL' : 'PASS',
    (findings.length ? findings.map((x) => `${x.file}:${x.line} ${x.rule}`).join(', ') : `no secrets in ${files.length} changed file(s)`) +
    ' (built-in scan; install gitleaks for full history scanning)');
}

function checkSast(files) {
  const scanned = files.filter((f) => !IGNORED.test(f) && !TEST_FILE.test(f));
  const found = sast.scanFiles(scanned);
  const by = (s) => found.filter((f) => f.severity === s);
  const list = (arr) => arr.map((f) => `${f.file}:${f.line} ${f.rule}`).join(', ');
  const status = by('high').length ? 'FAIL' : by('medium').length ? 'WARN' : 'PASS';
  const parts = [by('high').length && `high: ${list(by('high'))}`, by('medium').length && `medium: ${list(by('medium'))}`,
    by('low').length && `low: ${list(by('low'))}`].filter(Boolean);
  add('SAST (built-in)', status, parts.length ? parts.join('; ') : 'no insecure patterns');
  if (has('semgrep')) {
    const r = run('semgrep', ['scan', '--config', 'p/javascript', '--config', 'p/secrets', '--error', '--quiet', '--metrics=off', ...scanned]);
    const status = r.ok ? 'PASS' : r.status === 1 ? 'FAIL' : 'WARN'; // exit 1 = findings; other codes = tool error
    add('SAST (semgrep)', status, r.ok ? 'no findings' : r.status === 1 ? lastLine(r.out) : `semgrep error (exit ${r.status}): ${lastLine(r.out)}`);
  }
}

function checkDependencies(projects) {
  const locks = projects.flatMap((p) => LOCKFILES.filter((l) => fs.existsSync(path.join(p, l))).map((l) => path.join(p, l)));
  if (!locks.length) return add('Dependencies', 'SKIP', 'no lockfiles in changed projects');
  for (const lock of locks) {
    if (has('osv-scanner')) {
      const r = run('osv-scanner', [`--lockfile=${lock}`]);
      add(`Dependencies: ${lock}`, r.ok ? 'PASS' : 'FAIL', r.ok ? 'osv-scanner: no known vulnerabilities' : `osv-scanner: ${lastLine(r.out)}`);
    } else if (lock.endsWith('package-lock.json')) {
      const r = run('npm', ['audit', '--audit-level=high'], path.dirname(lock));
      add(`Dependencies: ${lock}`, r.ok ? 'PASS' : 'FAIL', r.ok ? 'npm audit: no high/critical' : `npm audit: ${lastLine(r.out)}`);
    } else add(`Dependencies: ${lock}`, 'WARN', 'not scanned (install osv-scanner)');
  }
}

// The factory's own tools have tests too. Run them when anything under .claude/tools changes.
function checkToolTests(files) {
  if (!ALL && !files.some((f) => f.startsWith('.claude/tools/'))) return;
  const testFiles = findTestFiles([path.join('.claude', 'tools', 'tests')]);
  const node = findNode(18);
  if (!testFiles.length || !node) return add('Tests: .claude/tools/', 'WARN', !node ? 'no Node 18+ available' : 'no tool tests');
  const r = run(node.exe, ['--test', ...testFiles]);
  const m = /# pass (\d+)[\s\S]*# fail (\d+)/.exec(r.out);
  add('Tests: .claude/tools/', r.ok ? 'PASS' : 'FAIL', m ? `${m[1]} passed, ${m[2]} failed` : lastLine(r.out));
}

function checkDiffSize() {
  if (ALL) return;
  const stat = tryGit('diff', '--numstat', `${base}...HEAD`).split('\n').filter(Boolean)
    .map((l) => l.split('\t')).filter(([, , f]) => f && !IGNORED.test(f));
  const lines = stat.reduce((n, [a, d]) => n + (Number(a) || 0) + (Number(d) || 0), 0);
  add('Change size (small batches)', lines > LIMITS.diffLines ? 'WARN' : 'PASS',
    `${lines} lines across ${stat.length} file(s) vs ${base}${lines > LIMITS.diffLines ? '; consider splitting the PR' : ''}`);
}

const files = changedFiles();
const projects = projectsOf(files);
checkSyntax(files);
checkFileSize(files);
checkTests(files, projects);
checkLint(projects);
checkSecrets(files);
checkSast(files);
checkDependencies(projects);
checkToolTests(files);
checkDiffSize();

const icon = { PASS: '✅', WARN: '⚠️', FAIL: '❌', SKIP: '➖' };
console.log(`### Quality gate (${ALL ? 'all tracked files' : `changes vs ${base}`})\n`);
console.log('| Check | Result | Detail |\n|---|---|---|');
for (const r of results) console.log(`| ${r.check} | ${icon[r.status]} ${r.status} | ${r.detail.replace(/\|/g, '\\|')} |`);
const failed = results.filter((r) => r.status === 'FAIL').length;
console.log(`\n${failed ? `**${failed} check(s) failed.** Fix before opening the PR.` : 'No failing checks.'}`);
process.exit(failed ? 1 : 0);
