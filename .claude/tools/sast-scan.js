// Offline static security scan (SAST) for JS and HTML: common injection sinks and insecure patterns.
// It is a fast first line. Semgrep and CodeQL run in CI for deeper analysis.
// Usage as CLI: node .claude/tools/sast-scan.js <file>...   (exit 1 if any high-severity finding)
// Suppress a reviewed line with a trailing comment: // sast-scan: allow (reason)
const fs = require('fs');

const JS = /\.(m?js|cjs|jsx|ts|tsx|vue|svelte|html?)$/i; // HTML can carry inline <script>
const HTML = /\.html?$/i;

const LINE_RULES = [
  { id: 'inner-html', severity: 'high', files: JS, re: /\.(?:innerHTML|outerHTML)\s*\+?=(?!=)/,
    message: 'Assigning HTML from data enables XSS. Use textContent or DOM APIs.' },
  { id: 'insert-adjacent-html', severity: 'high', files: JS, re: /\.insertAdjacentHTML\s*\(/,
    message: 'insertAdjacentHTML parses HTML. Build elements with createElement + textContent.' },
  { id: 'document-write', severity: 'high', files: JS, re: /\bdocument\.write(?:ln)?\s*\(/,
    message: 'document.write injects raw HTML.' },
  { id: 'eval', severity: 'high', files: JS, re: /(?:^|[^\w.$])eval\s*\(/,
    message: 'eval executes arbitrary code.' },
  { id: 'new-function', severity: 'high', files: JS, re: /\bnew\s+Function\s*\(/,
    message: 'new Function executes arbitrary code.' },
  { id: 'string-timer', severity: 'high', files: JS, re: /\bset(?:Timeout|Interval)\s*\(\s*['"`]/,
    message: 'String timers are evaluated like eval. Pass a function.' },
  { id: 'command-injection', severity: 'high', files: JS, re: /\b(?:exec|execSync|spawn|spawnSync)\s*\(\s*`[^`]*\$\{/,
    message: 'Shell command built from interpolated data. Use execFile/spawn with an args array.' },
  { id: 'react-dangerous-html', severity: 'high', files: JS, re: /dangerouslySetInnerHTML/,
    message: 'dangerouslySetInnerHTML renders raw HTML.' },
  { id: 'insecure-http', severity: 'medium', files: JS, re: /['"`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/,
    message: 'Plain-HTTP URL. Use https.' },
  { id: 'sensitive-storage', severity: 'medium', files: JS,
    re: /\b(?:localStorage|sessionStorage)\.setItem\(\s*['"`][^'"`]*(?:token|password|passwd|secret|jwt|session)/i,
    message: 'Secrets in web storage are readable by any script on the page.' },
  { id: 'blank-target-no-noopener', severity: 'medium', files: HTML,
    test: (line) => /target\s*=\s*["']_blank["']/i.test(line) && !/rel\s*=\s*["'][^"']*noopener/i.test(line),
    message: 'target="_blank" without rel="noopener" lets the opened page control this one.' },
  { id: 'inline-event-handler', severity: 'low', files: HTML, re: /<[a-z][^>]*\son[a-z]+\s*=\s*["']/i,
    message: 'Inline event handlers block a strict Content-Security-Policy. Use addEventListener.' },
];

const FILE_RULES = [
  { id: 'missing-csp', severity: 'low', files: HTML,
    test: (text) => /<head[\s>]/i.test(text) && !/http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(text),
    message: 'No Content-Security-Policy meta tag. Add one to limit script sources.' },
];

function scanText(text, file) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/sast-scan:\s*allow/.test(line)) return;
    for (const r of LINE_RULES) {
      if (!r.files.test(file)) continue;
      if (r.re ? r.re.test(line) : r.test(line)) findings.push({ file, line: i + 1, rule: r.id, severity: r.severity, message: r.message });
    }
  });
  for (const r of FILE_RULES) {
    if (r.files.test(file) && r.test(text)) findings.push({ file, line: 1, rule: r.id, severity: r.severity, message: r.message });
  }
  return findings;
}

function scanFiles(files) {
  const findings = [];
  for (const file of files) {
    if (!JS.test(file)) continue;
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    findings.push(...scanText(text, file));
  }
  return findings;
}

module.exports = { scanText, scanFiles };

if (require.main === module) {
  const findings = scanFiles(process.argv.slice(2));
  for (const f of findings) console.log(`${f.severity.toUpperCase().padEnd(6)} ${f.file}:${f.line}  ${f.rule}: ${f.message}`);
  process.exit(findings.some((f) => f.severity === 'high') ? 1 : 0);
}
