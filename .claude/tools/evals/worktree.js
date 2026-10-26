// Git side of the ticket evals: temporary worktrees (the user's checkout is never touched), the ticket's
// changed files, and the SWE-bench-style fail-to-pass check for unit tests.
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const UNIT_TEST = /\.test\.[cm]?js$/;

function addWorktree(sha) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-eval-'));
  git(['worktree', 'add', '--detach', '--quiet', dir, sha]);
  return dir;
}

// Removes only the temporary worktree this module created (never the user's checkout or branches).
function removeWorktree(dir) {
  try { git(['worktree', 'remove', '--force', dir]); } catch { /* already gone */ }
}

// Lines added/deleted per file for a set of commits (each a squash-merged PR), or for base..head.
function numstat(args) {
  return git(args).split('\n').filter(Boolean).map((l) => {
    const [a, d, file] = l.split('\t');
    return { path: file, added: Number(a) || 0, deleted: Number(d) || 0 };
  });
}

function changedFiles({ commits, base, head }) {
  const all = commits && commits.length
    ? commits.flatMap((c) => numstat(['show', '--numstat', '--format=', c]))
    : numstat(['diff', '--numstat', base, head]);
  const byPath = new Map();
  for (const f of all) {
    const prev = byPath.get(f.path) || { path: f.path, added: 0, deleted: 0 };
    byPath.set(f.path, { path: f.path, added: prev.added + f.added, deleted: prev.deleted + f.deleted });
  }
  return [...byPath.values()];
}

function runNodeTest(node, file, cwd) {
  const r = spawnSync(node, ['--test', file], { cwd, encoding: 'utf8' });
  const m = /# pass (\d+)[\s\S]*# fail (\d+)/.exec(`${r.stdout}${r.stderr}`);
  return { ok: r.status === 0, passed: m ? Number(m[1]) : 0, failed: m ? Number(m[2]) : 0 };
}

// For each unit-test file the ticket added or changed: does the HEAD version of the test fail against the
// BASE code (before the ticket) and pass against the HEAD code? That proves the tests exercise the new work.
function failToPass({ node, baseDir, headDir, head, testFiles }) {
  return testFiles.filter((f) => UNIT_TEST.test(f) && fs.existsSync(path.join(headDir, f))).map((file) => {
    const target = path.join(baseDir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, git(['show', `${head}:${file}`]));
    const before = runNodeTest(node, target, baseDir);
    const after = runNodeTest(node, path.join(headDir, file), headDir);
    return { file, failsBefore: !before.ok, passesAfter: after.ok, before, after };
  });
}

module.exports = { git, addWorktree, removeWorktree, changedFiles, failToPass, runNodeTest, root };
