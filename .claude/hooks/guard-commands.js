// PreToolUse hook: deterministically blocks dangerous tool calls before they run, whatever
// the model was told (e.g. by text in a ticket). Backs up the deny rules in settings.json,
// which only match command prefixes, by also catching reordered flags and chained commands.
// Blocks: recursive deletes, force pushes, downloads piped into a shell, and reading .env files.
// Exit 2 tells Claude Code to cancel the call and show the reason to the model.

const DOWNLOAD = String.raw`(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)`;
const SHELLS = String.raw`(?:sh|bash|zsh|dash|ksh|fish|iex|invoke-expression)`;
const INTERPRETERS = String.raw`(?:python\d*|node|perl|ruby|pwsh|powershell)`;

const PIPE_TO_SHELL = [
  new RegExp(String.raw`\b${DOWNLOAD}\b[^|\n]*\|\s*(?:sudo\s+)?${SHELLS}\b`, 'i'),
  // An interpreter with no script file runs whatever arrives on stdin.
  new RegExp(String.raw`\b${DOWNLOAD}\b[^|\n]*\|\s*(?:sudo\s+)?${INTERPRETERS}(?:\s+-\S*)*\s*(?:$|[;&|])`, 'i'),
  new RegExp(String.raw`\b(?:sh|bash|zsh)\s+<\(\s*${DOWNLOAD}\b`, 'i'),
  new RegExp(String.raw`\b(?:sh|bash|zsh)\b[^\n]*-c\s*["']?\$\(\s*${DOWNLOAD}\b`, 'i'),
  new RegExp(String.raw`\b(?:iex|invoke-expression)\b[^\n]*\b${DOWNLOAD}\b`, 'i'),
];

const ENV_IN_COMMAND = /(?:^|[\s'"=/\\:(<])\.env(?:\.[\w.-]+)?(?=$|[\s'"`;&|)>])/;
const ENV_PATH = /(?:^|[/\\])\.env(?:\.[^/\\]*|\*[^/\\]*)?$/;

const segments = (command) => command.split(/&&|\|\||[;|\n]/);
const tokens = (text) => text.trim().split(/\s+/).filter(Boolean);

function isRecursiveDelete(command) {
  for (const seg of segments(command)) {
    const m = seg.match(/(?<![\w-])(?<!git\s+)rm\s+(.*)$/);
    if (m) {
      const flags = tokens(m[1]).filter((t) => t.startsWith('-'));
      const short = flags.filter((t) => !t.startsWith('--')).join('');
      const recursive = /r/i.test(short) || flags.includes('--recursive');
      const force = short.includes('f') || flags.includes('--force');
      if (recursive && force) return true;
    }
    if (/\b(?:remove-item|ri|rmdir|rd|del)\b.*\s(?:-r|-recurse|\/s)\b/i.test(seg)) return true;
  }
  return false;
}

function isForcePush(command) {
  return segments(command).some((seg) => {
    const m = seg.match(/\bgit\b.*?\bpush\b(.*)$/i);
    if (!m) return false;
    return tokens(m[1]).some((t) => t.startsWith('--force') || t.startsWith('+') || /^-[a-z]*f[a-z]*$/i.test(t));
  });
}

function checkCommand(command) {
  if (isRecursiveDelete(command)) return 'recursive delete (rm -rf, Remove-Item -Recurse) is not allowed';
  if (isForcePush(command)) return 'force push (--force, -f, +refspec) is not allowed';
  if (PIPE_TO_SHELL.some((re) => re.test(command))) return 'a download piped into a shell (curl | sh, iwr | iex) is not allowed';
  if (ENV_IN_COMMAND.test(command)) return 'commands that touch a .env file are not allowed';
  return null;
}

// Returns the reason a tool call is blocked, or null when it may run.
function checkToolCall({ tool_name: tool, tool_input: input } = {}) {
  if (!input) return null;
  let reason = null;
  if ((tool === 'Bash' || tool === 'PowerShell') && typeof input.command === 'string') {
    reason = checkCommand(input.command);
  } else if (tool === 'Read' || tool === 'Grep') {
    const paths = [input.file_path, input.path, input.glob].filter((p) => typeof p === 'string');
    if (paths.some((p) => ENV_PATH.test(p))) reason = 'reading a .env file is not allowed';
  }
  return reason && `Blocked by guard-commands hook: ${reason}. Do not retry another way; ask the owner if this is really needed.`;
}

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    let payload;
    try { payload = JSON.parse(raw); } catch {
      process.stderr.write('Blocked by guard-commands hook: unreadable hook payload.');
      process.exit(2);
    }
    const reason = checkToolCall(payload);
    if (reason) { process.stderr.write(reason); process.exit(2); }
  });
}

module.exports = { checkToolCall, checkCommand };
