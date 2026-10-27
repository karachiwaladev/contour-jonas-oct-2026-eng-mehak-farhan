// Decides what the Stop hook may commit and push, so parallel sessions sharing one checkout
// never commit or push each other's work. Pure functions; auto-commit.js does the git calls.
const path = require('path');

const DEFAULT_BRANCHES = ['main', 'master'];
const LOG_DIR = '.claude/prompts';
const EDIT_TOOLS = { Edit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' };

// Repo-relative (forward-slash) paths this session changed with its file-editing tools.
// Shell commands are not tracked: files they create are committed explicitly by the session.
function editedFiles(transcriptText, repoRoot) {
  const files = new Set();
  for (const line of transcriptText.split('\n')) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const content = entry && entry.type === 'assistant' && entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const key = block && block.type === 'tool_use' && EDIT_TOOLS[block.name];
      const file = key && block.input && block.input[key];
      if (typeof file !== 'string') continue;
      const rel = path.relative(repoRoot, path.resolve(repoRoot, file));
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
      files.add(rel.split(path.sep).join('/'));
    }
  }
  return [...files];
}

// Paths from `git status --porcelain -z --untracked-files=all`. A rename entry is followed by
// its old path, which is skipped.
function parseStatus(out) {
  const parts = out.split('\0').filter(Boolean);
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i].slice(0, 2);
    files.push(parts[i].slice(3));
    if (/[RC]/.test(code)) i++;
  }
  return files;
}

// One log per session and branch: logs written on different branches never conflict on merge.
function logFileName(sessionId, branch) {
  const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '');
  return `${LOG_DIR}/${safe(sessionId)}.${safe(branch)}.jsonl`;
}

const isWorkBranch = (branch) => Boolean(branch) && branch !== 'HEAD' && !DEFAULT_BRANCHES.includes(branch);

// On a work branch: the session's own uncommitted edits plus its log. On main/master or a
// detached HEAD: only the log (never on detached), and the session's edits are held back.
function planCommit({ branch, dirty, sessionFiles, logFile }) {
  const dirtySet = new Set(dirty);
  const edits = sessionFiles.filter((f) => dirtySet.has(f) && f !== logFile);
  const logDirty = dirtySet.has(logFile) && branch !== 'HEAD';
  if (!isWorkBranch(branch)) return { files: logDirty ? [logFile] : [], heldBack: edits };
  return { files: logDirty ? [...edits, logFile] : edits, heldBack: [] };
}

// Work branches push freely. main/master push only when every unpushed change is a prompt log.
function mayPush({ branch, unpushedFiles }) {
  if (isWorkBranch(branch)) return true;
  if (!DEFAULT_BRANCHES.includes(branch) || !unpushedFiles.length) return false;
  return unpushedFiles.every((f) => f.startsWith(`${LOG_DIR}/`));
}

module.exports = { editedFiles, parseStatus, logFileName, planCommit, mayPush, LOG_DIR };
