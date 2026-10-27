const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { editedFiles, parseStatus, logFileName, planCommit, mayPush } = require('../../hooks/stop-scope');

const root = path.resolve('/repo');
const toolUse = (name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });

test('editedFiles lists repo files changed by Edit, Write and NotebookEdit', () => {
  const transcript = [
    toolUse('Edit', { file_path: path.join(root, 'todo', 'app.js') }),
    toolUse('Write', { file_path: path.join(root, 'todo', 'new.js') }),
    toolUse('NotebookEdit', { notebook_path: path.join(root, 'nb.ipynb') }),
    toolUse('Edit', { file_path: path.join(root, 'todo', 'app.js') }),
  ].join('\n');
  assert.deepEqual(editedFiles(transcript, root), ['todo/app.js', 'todo/new.js', 'nb.ipynb']);
});

test('editedFiles ignores reads, shell commands, files outside the repo and bad lines', () => {
  const transcript = [
    toolUse('Read', { file_path: path.join(root, 'a.js') }),
    toolUse('Bash', { command: 'echo hi > b.js' }),
    toolUse('Write', { file_path: path.resolve('/elsewhere/c.js') }),
    toolUse('Write', { file_path: path.join(root, '..', 'escape.js') }),
    toolUse('Write', { file_path: 42 }),
    'not json',
    JSON.stringify({ type: 'user', message: { content: 'Edit todo/app.js' } }),
  ].join('\n');
  assert.deepEqual(editedFiles(transcript, root), []);
});

test('parseStatus reads porcelain -z output, including renames and untracked files', () => {
  const out = ' M todo/app.js\0?? todo/new file.js\0R  todo/b.js\0todo/a.js\0';
  assert.deepEqual(parseStatus(out), ['todo/app.js', 'todo/new file.js', 'todo/b.js']);
  assert.deepEqual(parseStatus(''), []);
});

test('logFileName is one file per session and branch, safe for any branch name', () => {
  assert.equal(logFileName('abc-123', 'ticket-7-x'), '.claude/prompts/abc-123.ticket-7-x.jsonl');
  assert.equal(logFileName('abc', 'feature/a b'), '.claude/prompts/abc.feature_a_b.jsonl');
  assert.equal(logFileName('../../x', 'main'), '.claude/prompts/x.main.jsonl');
});

const log = '.claude/prompts/s1.ticket-7-x.jsonl';

test('planCommit on a work branch commits only dirty files this session edited, plus its log', () => {
  const plan = planCommit({
    branch: 'ticket-7-x',
    dirty: ['todo/app.js', 'someone-else.js', log],
    sessionFiles: ['todo/app.js', 'todo/already-committed.js'],
    logFile: log,
  });
  assert.deepEqual(plan, { files: ['todo/app.js', log], heldBack: [] });
});

test('planCommit on main commits only the log and holds back the session edits', () => {
  const mainLog = '.claude/prompts/s1.main.jsonl';
  const plan = planCommit({ branch: 'main', dirty: ['todo/app.js', mainLog], sessionFiles: ['todo/app.js'], logFile: mainLog });
  assert.deepEqual(plan, { files: [mainLog], heldBack: ['todo/app.js'] });
  assert.deepEqual(planCommit({ branch: 'master', dirty: ['x.js'], sessionFiles: ['x.js'], logFile: 'l' }).files, []);
});

test('planCommit commits nothing on a detached HEAD', () => {
  assert.deepEqual(planCommit({ branch: 'HEAD', dirty: ['a.js'], sessionFiles: ['a.js'], logFile: 'l' }), { files: [], heldBack: ['a.js'] });
});

test('mayPush pushes work branches, and main only when every unpushed change is a prompt log', () => {
  assert.equal(mayPush({ branch: 'ticket-7-x', unpushedFiles: ['todo/app.js'] }), true);
  assert.equal(mayPush({ branch: 'main', unpushedFiles: ['.claude/prompts/s1.main.jsonl'] }), true);
  assert.equal(mayPush({ branch: 'main', unpushedFiles: ['.claude/prompts/s1.main.jsonl', 'todo/app.js'] }), false);
  assert.equal(mayPush({ branch: 'main', unpushedFiles: [] }), false);
  assert.equal(mayPush({ branch: 'HEAD', unpushedFiles: ['a.js'] }), false);
});
