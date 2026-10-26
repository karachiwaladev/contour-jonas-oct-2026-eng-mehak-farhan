// Lightweight secret detection shared by the quality gate and the Stop hook.
// It is a fallback for when Gitleaks isn't installed, not a replacement for it.
// Usage as CLI: node .claude/tools/secret-scan.js <file>...   (exit 1 if anything is found)
const fs = require('fs');

const RULES = [
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'github-token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/ },
  { id: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'stripe-key', re: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/ },
  // key = "long random-looking value" for names that usually hold secrets
  { id: 'generic-secret-assignment', re: /\b(?:api[_-]?key|secret|passwd|password|access[_-]?token|auth[_-]?token|client[_-]?secret)\b\s*[:=]\s*["'][^"'\s]{16,}["']/i },
];

const BINARY = /\.(png|jpe?g|gif|ico|pdf|zip|gz|woff2?|ttf|exe|dll)$/i;
const MAX_BYTES = 1024 * 1024;

// Returns [{ file, line, rule }] for each match. Matched text is never returned, so it can't leak into logs.
function scanText(text, file) {
  const findings = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (/secret-scan:\s*allow/.test(line)) return; // explicit, reviewable opt-out for test fixtures
    for (const rule of RULES) if (rule.re.test(line)) findings.push({ file, line: i + 1, rule: rule.id });
  });
  return findings;
}

function scanFiles(files) {
  const findings = [];
  for (const file of files) {
    if (BINARY.test(file)) continue;
    let stat;
    try { stat = fs.statSync(file); } catch { continue; }
    if (!stat.isFile() || stat.size > MAX_BYTES) continue;
    findings.push(...scanText(fs.readFileSync(file, 'utf8'), file));
  }
  return findings;
}

module.exports = { scanText, scanFiles, RULES };

if (require.main === module) {
  const findings = scanFiles(process.argv.slice(2));
  for (const f of findings) console.log(`${f.file}:${f.line}  ${f.rule}`);
  process.exit(findings.length ? 1 : 0);
}
