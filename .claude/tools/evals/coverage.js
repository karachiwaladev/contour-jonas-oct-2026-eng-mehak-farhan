// Parsing and grading for the coverage eval.
const TEST = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/i;

// Rows of `node --test --experimental-test-coverage` output -> { 'dir/file.js': { lines, branches, funcs, uncovered } }.
// Paths are normalized to forward slashes; test files and the "all files" total are skipped.
function parseUnitCoverage(text) {
  const out = {};
  for (const line of (text || '').split('\n')) {
    const m = /^#\s+(\S.*?)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*(.*)$/.exec(line);
    if (!m || m[1] === 'all files') continue;
    const file = m[1].replace(/\\/g, '/');
    if (TEST.test(file)) continue;
    out[file] = { lines: Number(m[2]), branches: Number(m[3]), funcs: Number(m[4]), uncovered: m[5].trim() };
  }
  return out;
}

// Rows of the browser-coverage.js table -> { 'dir/file.js': { lines, covered, total, uncovered } }.
function parseBrowserCoverage(text) {
  const out = {};
  for (const line of (text || '').split('\n')) {
    const m = /^\|\s*([^|*\s][^|]*?)\s*\|\s*\S*\s*([\d.]+)%\s*\|\s*(\d+)\/(\d+)\s*\|\s*([^|]*?)\s*\|$/.exec(line);
    if (!m) continue;
    out[m[1]] = { lines: Number(m[2]), covered: Number(m[3]), total: Number(m[4]), uncovered: m[5] === '-' ? '' : m[5] };
  }
  return out;
}

// PASS at or above target, WARN between min and target, FAIL below min or when no test loaded the file at all.
function gradeFile(pct, { min = 80, target = 90 } = {}) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return 'FAIL';
  return pct >= target ? 'PASS' : pct >= min ? 'WARN' : 'FAIL';
}

module.exports = { parseUnitCoverage, parseBrowserCoverage, gradeFile, TEST };
