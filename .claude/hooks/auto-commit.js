// Stop hook: commits any uncommitted work and pushes it. Never destructive:
// no force-push, no reset of the working tree, and no pull/rebase. If git is mid-merge,
// rebase or cherry-pick it does nothing. Files that look like secrets are left unstaged.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { scanFiles } = require('../tools/secret-scan');

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };

const SECRET_PATTERNS = [/(^|\/)\.env(\..*)?$/i, /\.(pem|key|p12|pfx)$/i, /(^|\/)id_(rsa|ed25519|ecdsa)$/i, /credentials?(\.json)?$/i, /secrets?\.(json|ya?ml|txt)$/i];

function report(msg) {
  process.stdout.write(JSON.stringify({ systemMessage: `auto-commit: ${msg}` }));
}

function main() {
  const gitDir = tryGit('rev-parse', '--git-dir');
  if (!gitDir) return;
  const abs = path.resolve(cwd, gitDir);
  const busy = ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'].some((f) => fs.existsSync(path.join(abs, f)));
  if (busy) return report('skipped, a merge/rebase is in progress.');

  const messages = [];
  if (git('status', '--porcelain')) {
    git('add', '-A');
    const staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
    // Hold back secret-looking file names, and any file whose contents match a secret pattern.
    const byContent = new Set(scanFiles(staged.map((f) => path.join(cwd, f))).map((x) => path.relative(cwd, x.file).split(path.sep).join('/')));
    const secrets = staged.filter((f) => SECRET_PATTERNS.some((re) => re.test(f)) || byContent.has(f));
    // Unstaging only touches the index; the files stay on disk untouched.
    if (secrets.length) git('reset', '-q', '--', ...secrets);
    const toCommit = staged.filter((f) => !secrets.includes(f));
    if (secrets.length) messages.push(`left possible secrets unstaged: ${secrets.join(', ')}`);
    if (toCommit.length) {
      const listed = toCommit.slice(0, 15).map((f) => `- ${f}`).join('\n') + (toCommit.length > 15 ? `\n- ...and ${toCommit.length - 15} more` : '');
      const msg = `Auto-commit on stop (${toCommit.length} file${toCommit.length === 1 ? '' : 's'})\n\n${listed}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
      git('commit', '-q', '-m', msg);
      messages.push(`committed ${toCommit.length} file(s)`);
    }
  }

  const branch = tryGit('rev-parse', '--abbrev-ref', 'HEAD');
  if (!branch || branch === 'HEAD') return messages.length && report(messages.join('; '));
  const upstream = tryGit('rev-parse', '--abbrev-ref', '@{u}');
  const ahead = upstream ? Number(tryGit('rev-list', '--count', '@{u}..HEAD') || 0) : 1;
  if (ahead > 0) {
    try {
      git('push', '-q', 'origin', branch);
      messages.push(`pushed ${branch}`);
    } catch (e) {
      // Never force or rebase automatically; leave it for a human.
      messages.push(`push failed, run "git pull --rebase" then push manually (${(e.stderr || e.message).split('\n')[0]})`);
    }
  }
  if (messages.length) report(messages.join('; '));
}

try { main(); } catch (e) { report(`error: ${e.message.split('\n')[0]}`); }
