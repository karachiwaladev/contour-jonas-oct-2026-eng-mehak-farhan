// Line coverage of project JS from the browser tests: runs each <project>/tests/browser/*.test.html in headless
// Edge/Chrome with V8 precise coverage (Chrome DevTools Protocol), then reports covered lines per source file
// (union across pages). Unit-test coverage comes from: node .claude/tools/run-tests.js --coverage
// Usage: node .claude/tools/browser-coverage.js [pages...] [--min 80] [--warn 90] [--port 8793]
//   --min   fail (exit 1) if any file's line coverage is below this percent (default 80)
//   --warn  flag files below this percent (default 90)
// Needs a WebSocket client: Node 22+, or Node 20.10+ with --experimental-websocket (it re-launches itself).
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

if (typeof WebSocket === 'undefined' && !process.env.FACTORY_COVERAGE_CHILD) {
  const { findNode } = require('./run-tests');
  const node = findNode(20);
  if (!node) { console.error('Needs Node 20+ (set FACTORY_NODE).'); process.exit(2); }
  const r = spawnSync(node.exe, ['--experimental-websocket', '--no-warnings', __filename, ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, FACTORY_COVERAGE_CHILD: '1' } });
  process.exit(r.status === null ? 1 : r.status);
}

const { findBrowser, findPages } = require('./browser-test');
const root = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const num = (flag, def) => (args.includes(flag) ? Number(args[args.indexOf(flag) + 1]) : def);
const MIN = num('--min', 80), WARN = num('--warn', 90), PORT = num('--port', 8793), DEBUG_PORT = PORT + 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Source files only: /<project>/<file>.js, never test pages, harness or factory tools.
const SOURCE_URL = new RegExp(`^http://localhost:${PORT}/([\\w-]+/[\\w.-]+\\.js)$`);

// V8 lists a function's outer range first and nested blocks after, so applying ranges in order leaves each
// byte with its innermost count. A line counts if it has code and any of its code bytes ran.
function lineCoverage(source, functions) {
  const counts = new Int32Array(source.length).fill(-1);
  for (const fn of functions) for (const r of fn.ranges) counts.fill(r.count, r.startOffset, Math.min(r.endOffset, source.length));
  let offset = 0;
  return source.split('\n').map((text) => {
    let hasCode = false, ran = false;
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i]) || '{}()[];,'.includes(text[i])) continue; // punctuation-only lines (closing braces) don't count
      hasCode = true;
      if (counts[offset + i] > 0) ran = true;
    }
    offset += text.length + 1;
    return hasCode ? ran : null;
  });
}

async function connect(browser, profile) {
  const flags = ['--headless=new', '--disable-gpu', '--no-first-run', /msedge/i.test(browser) ? '--inprivate' : '--incognito',
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`];
  if (process.env.CI && process.platform === 'linux') flags.push('--no-sandbox');
  const proc = spawn(browser, [...flags, 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 75 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!target) await sleep(200);
  }
  if (!target) throw new Error('browser did not expose a debugging target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = {};
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) pending[d.id](d); };
  const send = (method, params = {}) => new Promise((res) => { pending[++id] = res; ws.send(JSON.stringify({ id, method, params })); });
  return { send, close: () => { ws.close(); proc.kill(); } };
}

async function coverPage(send, page) {
  // Pages share one browser here, so wipe storage first: each page must start clean, as in browser-test.js
  // (e.g. errors.test.html deliberately leaves a newer-version database behind).
  await send('Storage.clearDataForOrigin', { origin: `http://localhost:${PORT}`, storageTypes: 'all' });
  await send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  await send('Page.navigate', { url: `http://localhost:${PORT}/${page}` });
  let results = null;
  for (let i = 0; i < 600 && !results; i++) {
    await sleep(100);
    const r = await send('Runtime.evaluate', { expression: "document.getElementById('factory-results')?.textContent || null", returnByValue: true });
    results = r.result && r.result.result && r.result.result.value;
  }
  const cov = await send('Profiler.takePreciseCoverage');
  await send('Profiler.stopPreciseCoverage');
  const lines = (results || '').split('\n');
  return { results, failed: results ? lines.filter((l) => l.startsWith('FAIL')).length : 1, passed: lines.filter((l) => l.startsWith('PASS')).length, scripts: cov.result.result };
}

async function main() {
  const pages = findPages(args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--')));
  if (!pages.length) { console.log('No browser tests found (<project>/tests/browser/*.test.html).'); return 0; }
  const browser = findBrowser();
  if (!browser) { console.error('No Edge/Chrome found. Set BROWSER.'); return 2; }
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), root, String(PORT)], { stdio: 'ignore' });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-coverage-'));
  const { send, close } = await connect(browser, profile);
  await send('Profiler.enable');
  await send('Runtime.enable');
  const merged = {};
  let testFailures = 0;
  try {
    for (const page of pages) {
      const out = await coverPage(send, page);
      testFailures += out.failed;
      console.log(`${page}: ${out.results ? `${out.passed} passed, ${out.failed} failed` : 'TIMED OUT (no results)'}`);
      for (const s of out.scripts) {
        const m = SOURCE_URL.exec(s.url);
        if (!m || /(^|\/)tests\//.test(m[1])) continue;
        const lines = lineCoverage(fs.readFileSync(path.join(root, m[1]), 'utf8').replace(/\r\n/g, '\n'), s.functions);
        merged[m[1]] = merged[m[1]] ? merged[m[1]].map((v, i) => (v === null ? null : v || lines[i])) : lines;
      }
    }
  } finally {
    close();
    server.kill();
  }
  return report(merged, testFailures);
}

function report(merged, testFailures) {
  console.log('\n| File | Lines | Covered | Uncovered lines |\n|---|---|---|---|');
  let below = 0, cov = 0, tot = 0;
  for (const [file, lines] of Object.entries(merged).sort()) {
    const code = lines.map((v, i) => ({ v, n: i + 1 })).filter((x) => x.v !== null);
    const c = code.filter((x) => x.v).length;
    const pct = code.length ? (100 * c) / code.length : 100;
    cov += c; tot += code.length;
    if (pct < MIN) below++;
    const mark = pct < MIN ? '❌' : pct < WARN ? '⚠️' : '✅';
    console.log(`| ${file} | ${mark} ${pct.toFixed(1)}% | ${c}/${code.length} | ${code.filter((x) => !x.v).map((x) => x.n).join(', ') || '-'} |`);
  }
  console.log(`| **All** | ${tot ? ((100 * cov) / tot).toFixed(1) : '100.0'}% | ${cov}/${tot} | |`);
  if (testFailures) console.log(`\n${testFailures} browser test(s) failed or timed out; coverage is incomplete.`);
  if (below) console.log(`\n${below} file(s) below the ${MIN}% minimum.`);
  return testFailures || below ? 1 : 0;
}

main().then((code) => setTimeout(() => process.exit(code), 500)).catch((e) => { console.error(e); process.exit(1); });
