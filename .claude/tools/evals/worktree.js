// Git side of the coverage eval: temporary worktrees (the user's checkout is never touched) and the files a
// ticket changed.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

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

module.exports = { git, addWorktree, removeWorktree, changedFiles, root };
