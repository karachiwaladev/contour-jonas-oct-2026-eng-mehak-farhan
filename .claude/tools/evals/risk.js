// PR risk score from change features used in just-in-time defect prediction: size, spread across modules,
// sensitive areas, test ratio, security findings and new dependencies. Returns 0-100, a level, and reasons.
const IGNORED = /(^|\/)screenshots\/|^\.claude\/prompts\.jsonl$|\.(png|jpe?g|gif|svg)$/i;
const TEST = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/i;
const LOCKFILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|requirements\.txt|poetry\.lock|go\.sum|Cargo\.lock)$/;
const SENSITIVE = [
  { re: /(^|\/)(db|storage|store|persist)[\w.-]*\.[jt]s$/i, what: 'storage/persistence code' },
  { re: /^\.github\//, what: 'CI workflows' },
  { re: /^\.claude\/(hooks\/|settings\.json)/, what: 'factory hooks/settings' },
  { re: /(auth|login|session|token|crypto|secret)/i, what: 'auth/security code' },
  { re: LOCKFILE, what: 'dependencies' },
];

function scoreRisk({ files, sastFindings = [] }) {
  const relevant = files.filter((x) => !IGNORED.test(x.path));
  const source = relevant.filter((x) => !TEST.test(x.path) && !LOCKFILE.test(x.path));
  const tests = relevant.filter((x) => TEST.test(x.path));
  const lines = (arr) => arr.reduce((n, x) => n + x.added + x.deleted, 0);
  const sourceLines = lines(source), testLines = lines(tests);
  const modules = new Set(source.map((x) => (x.path.includes('/') ? x.path.split('/')[0] : '.')));
  const reasons = [];
  let score = 0;
  const add = (points, why) => { if (points) { score += points; reasons.push(`${why} (+${points})`); } };

  add(sourceLines >= 600 ? 30 : sourceLines >= 300 ? 20 : sourceLines >= 100 ? 10 : 0, `${sourceLines} source lines changed`);
  add(source.length > 10 ? 15 : source.length > 5 ? 8 : 0, `${source.length} source files touched`);
  add(modules.size > 2 ? 10 : 0, `${modules.size} modules touched (${[...modules].join(', ')})`);
  const hit = SENSITIVE.filter((s) => relevant.some((x) => s.re.test(x.path))).map((s) => s.what);
  add(Math.min(30, 10 * hit.length), `sensitive areas: ${hit.join(', ')}`);
  const ratio = sourceLines ? testLines / sourceLines : 1;
  add(sourceLines && ratio < 0.3 ? 15 : sourceLines && ratio < 0.6 ? 7 : 0, `test-to-source line ratio ${ratio.toFixed(2)}`);
  const high = sastFindings.filter((s) => s.severity === 'high').length, medium = sastFindings.filter((s) => s.severity === 'medium').length;
  add(high ? 20 : medium ? 10 : 0, `SAST findings: ${high} high, ${medium} medium`);
  add(relevant.some((x) => LOCKFILE.test(x.path)) ? 10 : 0, 'new or changed dependencies');

  score = Math.min(100, score);
  return { score, level: score >= 50 ? 'High' : score >= 25 ? 'Medium' : 'Low', reasons, sourceLines, testLines };
}

module.exports = { scoreRisk };
