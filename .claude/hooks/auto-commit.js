// Stop hook: commits and pushes only what this session changed (see stop-scope.js), so parallel
// sessions sharing one checkout never commit each other's work. Never destructive: no force-push,
// no reset of the working tree, and no pull/rebase. If git is mid-merge, rebase or cherry-pick it
// does nothing. Files that look like secrets are never committed.
// Reads the hook payload (session_id, transcript_path) on stdin.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { scanFiles } = require('../tools/secret-scan');
const { editedFiles, parseStatus, logFileName, planCommit, mayPush } = require('./stop-scope');

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const run = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const git = (...args) => run(...args).trim();
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };

const SECRET_PATTERNS = [/(^|\/)\.env(\..*)?$/i, /\.(pem|key|p12|pfx)$/i, /(^|\/)id_(rsa|ed25519|ecdsa)$/i, /credentials?(\.json)?$/i, /secrets?\.(json|ya?ml|txt)$/i];

function report(msg) {
  process.stdout.write(JSON.stringify({ systemMessage: `auto-commit: ${msg}` }));
}

// The session transcript plus any subagent transcripts stored beside it.
function readTranscripts({ session_id, transcript_path }) {
  if (!transcript_path || !fs.existsSync(transcript_path)) return '';
  const texts = [fs.readFileSync(transcript_path, 'utf8')];
  const subDir = path.join(path.dirname(transcript_path), String(session_id || ''), 'subagents');
  if (session_id && fs.existsSync(subDir)) {
    for (const f of fs.readdirSync(subDir).filter((n) => n.endsWith('.jsonl'))) texts.push(fs.readFileSync(path.join(subDir, f), 'utf8'));
  }
  return texts.join('\n');
}

function commit(files, messages) {
  const byContent = new Set(scanFiles(files.map((f) => path.join(cwd, f))).map((x) => path.relative(cwd, x.file).split(path.sep).join('/')));
  const secrets = files.filter((f) => SECRET_PATTERNS.some((re) => re.test(f)) || byContent.has(f));
  const toCommit = files.filter((f) => !secrets.includes(f));
  if (secrets.length) messages.push(`left possible secrets unstaged: ${secrets.join(', ')}`);
  if (!toCommit.length) return;
  const listed = toCommit.slice(0, 15).map((f) => `- ${f}`).join('\n') + (toCommit.length > 15 ? `\n- ...and ${toCommit.length - 15} more` : '');
  const msg = `Auto-commit on stop (${toCommit.length} file${toCommit.length === 1 ? '' : 's'})\n\n${listed}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  // Commit exactly these paths; anything else already staged stays staged and uncommitted.
  git('add', '--', ...toCommit);
  git('commit', '-q', '-m', msg, '--', ...toCommit);
  messages.push(`committed ${toCommit.length} file(s)`);
}

function push(branch, messages) {
  const remote = `origin/${branch}`;
  const known = tryGit('rev-parse', '--verify', '-q', remote);
  const unpushedFiles = known ? git('diff', '--name-only', `${remote}..HEAD`).split('\n').filter(Boolean) : ['(new branch)'];
  if (known && !Number(git('rev-list', '--count', `${remote}..HEAD`))) return;
  if (!mayPush({ branch, unpushedFiles })) {
    if (known) messages.push(`not pushing ${branch}: it has unpushed commits that are not prompt logs`);
    return;
  }
  try {
    git('push', '-q', 'origin', branch);
    messages.push(`pushed ${branch}`);
  } catch (e) {
    // Never force or rebase automatically; leave it for a human.
    messages.push(`push failed, run "git pull --rebase" then push manually (${(e.stderr || e.message).split('\n')[0]})`);
  }
}

function main(payload) {
  const gitDir = tryGit('rev-parse', '--git-dir');
  if (!gitDir) return;
  const abs = path.resolve(cwd, gitDir);
  const busy = ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'].some((f) => fs.existsSync(path.join(abs, f)));
  if (busy) return report('skipped, a merge/rebase is in progress.');

  const messages = [];
  const branch = tryGit('rev-parse', '--abbrev-ref', 'HEAD') || 'HEAD';
  const { files, heldBack } = planCommit({
    branch,
    dirty: parseStatus(run('status', '--porcelain', '-z', '--untracked-files=all')),
    sessionFiles: editedFiles(readTranscripts(payload), cwd),
    logFile: payload.session_id ? logFileName(payload.session_id, branch) : null,
  });
  if (files.length) commit(files, messages);
  if (heldBack.length) messages.push(`left ${heldBack.length} edited file(s) uncommitted on ${branch}; move them to a ticket branch`);
  if (branch !== 'HEAD') push(branch, messages);
  if (messages.length) report(messages.join('; '));
}

let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  let payload = {};
  try { payload = JSON.parse(input || '{}'); } catch {}
  try { main(payload); } catch (e) { report(`error: ${e.message.split('\n')[0]}`); }
});
