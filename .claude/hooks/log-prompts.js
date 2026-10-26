// Stop hook: appends the user prompts added since the last stop to .claude/prompts.jsonl.
// Reads the hook payload (session_id, transcript_path) from stdin and remembers how many
// transcript lines it has already scanned per session in .claude/prompts.state.json.
const fs = require('fs');
const path = require('path');

const claudeDir = path.join(__dirname, '..');
const logFile = path.join(claudeDir, 'prompts.jsonl');
const stateFile = path.join(claudeDir, 'prompts.state.json');

function promptText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  // Tool results come back as user messages; they are not prompts.
  if (content.some((b) => b && b.type === 'tool_result')) return null;
  const text = content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
  return text || null;
}

let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  const { session_id, transcript_path } = JSON.parse(input || '{}');
  if (!session_id || !transcript_path || !fs.existsSync(transcript_path)) return;

  let state = {};
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}

  const lines = fs.readFileSync(transcript_path, 'utf8').split('\n');
  // Drop a trailing partial line so it is re-read next time.
  const complete = lines.slice(0, -1);
  const start = state[session_id] || 0;

  const out = [];
  for (const line of complete.slice(start)) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type !== 'user' || entry.isMeta || entry.isCompactSummary) continue;
    const text = promptText(entry.message && entry.message.content);
    if (!text) continue;
    out.push(JSON.stringify({ timestamp: entry.timestamp, session_id, uuid: entry.uuid, prompt: text }));
  }

  if (out.length) fs.appendFileSync(logFile, out.join('\n') + '\n');
  state[session_id] = complete.length;
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
});
