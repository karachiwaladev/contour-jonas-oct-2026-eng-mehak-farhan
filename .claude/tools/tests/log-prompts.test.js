const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const hook = path.join(__dirname, '..', '..', 'hooks', 'log-prompts.js');

test('writes new prompts to a log file for this session and branch', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logprompts-'));
  execFileSync('git', ['init', '-q', '-b', 'ticket-2-y'], { cwd: dir });
  const transcript = path.join(dir, 't.jsonl');
  const lines = [
    { type: 'user', timestamp: 't1', uuid: 'u1', message: { content: 'build the thing' } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } },
  ];
  fs.writeFileSync(transcript, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const run = () => execFileSync(process.execPath, [hook], {
    input: JSON.stringify({ session_id: 's9', transcript_path: transcript }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  run();
  run(); // a second stop with no new prompts adds nothing
  const log = fs.readFileSync(path.join(dir, '.claude', 'prompts', 's9.ticket-2-y.jsonl'), 'utf8').trim().split('\n');
  assert.equal(log.length, 1);
  assert.equal(JSON.parse(log[0]).prompt, 'build the thing');
});
