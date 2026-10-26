// Pure case-builders for the unit-tests and merge-risk evals, and the shared results.json shape:
// { eval, ticket, score, passed, total, cases: [{ id, pass, detail }], generatedAt, ...extra }.
const { TEST } = require('./coverage');

const UNIT_MIN = 80;

// unit-tests: one case per changed source file. It passes when the node:test unit suite covers it at >= 80% lines.
function unitTestCases(sources, unit) {
  return sources.map((file) => {
    const u = unit[file];
    if (!u) return { id: file, pass: false, detail: 'no unit test loads this file (browser tests only, or untested)' };
    return { id: file, pass: u.lines >= UNIT_MIN, detail: `unit line coverage ${u.lines}% (needs ${UNIT_MIN}%)` };
  });
}

// Images, screenshots, the prompt log and documentation don't carry code risk.
const IGNORED = /(^|\/)screenshots\/|^\.claude\/prompts\.jsonl$|\.(png|jpe?g|gif|svg|md|txt)$/i;
const LOCKFILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|requirements\.txt|poetry\.lock|go\.sum|Cargo\.lock)$/;
const SENSITIVE = [
  { re: /(^|\/)(db|storage|store|persist)[\w.-]*\.[jt]s$/i, what: 'storage/persistence' },
  { re: /^\.github\//, what: 'CI workflows' },
  { re: /^\.claude\/(hooks\/|settings\.json)/, what: 'factory hooks/settings' },
  { re: /(auth|login|session|token|crypto|secret)/i, what: 'auth/security' },
];

// merge-risk: one case per risk factor; pass = safe. Based on just-in-time defect-prediction features.
function mergeRiskCases({ files, sastFindings = [] }) {
  const relevant = files.filter((f) => !IGNORED.test(f.path));
  const source = relevant.filter((f) => !TEST.test(f.path) && !LOCKFILE.test(f.path));
  const lines = (arr) => arr.reduce((n, f) => n + f.added + f.deleted, 0);
  const srcLines = lines(source), testLines = lines(relevant.filter((f) => TEST.test(f.path)));
  const modules = [...new Set(source.map((f) => (f.path.includes('/') ? f.path.split('/')[0] : '.')))];
  const sensitive = SENSITIVE.filter((s) => relevant.some((f) => s.re.test(f.path))).map((s) => s.what);
  const ratio = srcLines ? testLines / srcLines : 1;
  const high = sastFindings.filter((s) => s.severity === 'high').length;
  const deps = relevant.filter((f) => LOCKFILE.test(f.path)).map((f) => f.path);
  return [
    { id: 'small-diff', pass: srcLines <= 400, detail: `${srcLines} source lines changed (safe ≤ 400)` },
    { id: 'few-files', pass: source.length <= 10, detail: `${source.length} source files touched (safe ≤ 10)` },
    { id: 'few-modules', pass: modules.length <= 2, detail: `${modules.length} module(s): ${modules.join(', ') || 'none'} (safe ≤ 2)` },
    { id: 'no-sensitive-areas', pass: !sensitive.length, detail: sensitive.length ? `touches ${sensitive.join(', ')}` : 'no sensitive areas touched' },
    { id: 'test-ratio', pass: ratio >= 0.6, detail: `test-to-source line ratio ${ratio.toFixed(2)} (safe ≥ 0.60)` },
    { id: 'no-high-sast-findings', pass: !high, detail: `${high} high-severity SAST finding(s)` },
    { id: 'no-dependency-changes', pass: !deps.length, detail: deps.length ? `dependency files changed: ${deps.join(', ')}` : 'no dependency changes' },
  ];
}

function toResults(name, ticket, cases, extra = {}) {
  const passed = cases.filter((c) => c.pass).length;
  return {
    eval: name,
    ticket,
    score: cases.length ? Math.round((100 * passed) / cases.length) : null,
    passed,
    total: cases.length,
    ...extra,
    cases: cases.map(({ id, pass, detail }) => ({ id, pass, detail })),
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { unitTestCases, mergeRiskCases, toResults };
