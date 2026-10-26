// Golden-set runner: fixed edge cases with expected results, kept in <project>/tests/golden/*.json and run
// against the project's pure modules. A golden set should stay at 100%; add every fixed bug as a new case.
// File format: { "module": "recurrence.js", "cases": [ { "id", "fn", "args": [...], "expect": ..., "why" } ] }
// Arguments may use { "$date": "YYYY-MM-DDTHH:mm" } for a local Date.
// Usage: node .claude/tools/evals/golden.js [<project-dir>...]   (default: every project with tests/golden)
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function revive(value) {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    if (typeof value.$date === 'string') {
      const [d, t = '00:00'] = value.$date.split('T');
      const [y, mo, day] = d.split('-').map(Number);
      const [h, mi] = t.split(':').map(Number);
      return new Date(y, mo - 1, day, h, mi);
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
  }
  return value;
}

function evaluateCase(c, mod) {
  let actual;
  try {
    if (typeof mod[c.fn] !== 'function') throw new Error(`no function ${c.fn}`);
    actual = mod[c.fn](...revive(c.args || []));
  } catch (e) {
    return { id: c.id, ok: false, actual: `threw: ${e.message}`, expected: c.expect };
  }
  let ok = true;
  try { assert.deepStrictEqual(actual, c.expect); } catch { ok = false; }
  return { id: c.id, ok, actual, expected: c.expect };
}

// Runs every golden file in <projectDir>/tests/golden against the modules in codeDir (default: the same project;
// the evals pass an older checkout to check a past ticket's code against today's golden set).
// Returns { total, passed, results: [{file, id, ok, ...}] }.
function runGolden(projectDir, codeDir = projectDir) {
  const dir = path.join(projectDir, 'tests', 'golden');
  const results = [];
  if (!fs.existsSync(dir)) return { total: 0, passed: 0, results };
  for (const file of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const spec = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const modPath = path.join(codeDir, spec.module);
    if (!fs.existsSync(modPath)) {
      for (const c of spec.cases) results.push({ file, id: c.id, ok: false, actual: `missing module ${spec.module}`, expected: c.expect });
      continue;
    }
    delete require.cache[require.resolve(modPath)];
    const mod = require(modPath);
    for (const c of spec.cases) results.push({ file, why: c.why, ...evaluateCase(c, mod) });
  }
  return { total: results.length, passed: results.filter((r) => r.ok).length, results };
}

module.exports = { revive, evaluateCase, runGolden };

if (require.main === module) {
  const root = path.resolve(__dirname, '..', '..', '..');
  const dirs = process.argv.slice(2).length ? process.argv.slice(2).map((d) => path.resolve(d))
    : fs.readdirSync(root).map((d) => path.join(root, d)).filter((d) => fs.existsSync(path.join(d, 'tests', 'golden')));
  let failed = 0;
  for (const d of dirs) {
    const out = runGolden(d);
    console.log(`${path.basename(d)}: ${out.passed}/${out.total} golden cases pass`);
    for (const r of out.results.filter((x) => !x.ok)) {
      failed++;
      console.log(`  FAIL ${r.file} ${r.id}: expected ${JSON.stringify(r.expected)}, got ${JSON.stringify(r.actual)}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
