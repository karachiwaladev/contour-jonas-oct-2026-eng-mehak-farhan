// End-to-end: runs the real auto-commit hook in a throwaway git repo (no remote, so pushes fail
// harmlessly) and checks it commits only this session's files.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const hook = path.join(__dirname, '..', '..', 'hooks', 'auto-commit.js');

function setup(branch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autocommit-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', branch);
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  return { dir, git };
}

function runHook(dir, sessionId, editedPaths) {
  const transcript = path.join(dir, '..', `${path.basename(dir)}.jsonl`);
  const lines = editedPaths.map((p) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: path.join(dir, p) } }] } }));
  fs.writeFileSync(transcript, lines.join('\n') + '\n');
  const payload = JSON.stringify({ session_id: sessionId, transcript_path: transcript });
  return execFileSync(process.execPath, [hook], { input: payload, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
}

const write = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};

test('on a work branch it commits the session edits and log, never other sessions\' files', () => {
  const { dir, git } = setup('ticket-1-x');
  write(dir, 'mine.js', 'a\n');
  write(dir, 'theirs.js', 'b\n');
  write(dir, '.claude/prompts/s1.ticket-1-x.jsonl', '{}\n');
  const out = runHook(dir, 's1', ['mine.js']);
  assert.match(out, /committed 2 file/);
  const committed = git('show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort();
  assert.deepEqual(committed, ['.claude/prompts/s1.ticket-1-x.jsonl', 'mine.js']);
  assert.match(git('status', '--porcelain'), /\?\? theirs\.js/);
});

test('on main it commits only the prompt log and reports held-back edits', () => {
  const { dir, git } = setup('main');
  write(dir, 'mine.js', 'a\n');
  write(dir, '.claude/prompts/s1.main.jsonl', '{}\n');
  const out = runHook(dir, 's1', ['mine.js']);
  assert.match(out, /left 1 edited file\(s\) uncommitted on main/);
  assert.equal(git('show', '--name-only', '--format=', 'HEAD').trim(), '.claude/prompts/s1.main.jsonl');
});

test('it never commits files with secret-looking names', () => {
  const { dir, git } = setup('ticket-1-x');
  write(dir, '.env', 'X=1\n');
  const out = runHook(dir, 's1', ['.env']);
  assert.match(out, /left possible secrets unstaged: \.env/);
  assert.equal(git('log', '--oneline').trim().split('\n').length, 1);
});
