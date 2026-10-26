// Runs browser tests headlessly: serves the repo, opens each <project>/tests/browser/*.test.html in a private
// headless Chromium (Edge or Chrome), and collects the results the harness POSTs back.
// Usage: node .claude/tools/browser-test.js [test pages...] [--port 8790] [--timeout 30000]
// Env: BROWSER=<path to msedge/chrome> to pick a browser. Exit 1 if any test fails or a page times out.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : def);
const port = opt('--port', 8790);
const timeoutMs = opt('--timeout', 30000);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function findBrowser() {
  const candidates = [
    process.env.BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return candidates.find((c) => c && fs.existsSync(c));
}

function findPages(list) {
  if (list.length) return list.map((p) => path.relative(root, path.resolve(p)).split(path.sep).join('/'));
  const pages = [];
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    const dir = path.join(root, d.name, 'tests', 'browser');
    if (!d.isDirectory() || d.name.startsWith('.') || !fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.test.html')) pages.push(`${d.name}/tests/browser/${f}`);
  }
  return pages;
}

let pending = null; // resolver for the page currently running
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__result') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => { res.end(); if (pending) pending(JSON.parse(body)); });
    return;
  }
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

function runPage(browser, page) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-browser-'));
  // Private mode keeps IndexedDB/localStorage in memory: a clean slate per page, and no disk-backed store needed.
  const privateFlag = /msedge/i.test(browser) ? '--inprivate' : '--incognito';
  const flags = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', privateFlag, `--user-data-dir=${profile}`];
  if (process.env.CI && process.platform === 'linux') flags.push('--no-sandbox'); // CI containers lack the user namespaces Chrome's sandbox needs
  const proc = spawn(browser, [...flags, `http://localhost:${port}/${page}`], { stdio: 'ignore' });
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ page, timeout: true, results: [] }), timeoutMs);
    pending = (data) => { clearTimeout(timer); resolve({ page, ...data }); };
  }).finally(() => {
    pending = null;
    proc.kill();
    // Only our own temp profile is removed. If the browser still holds it open, leave it.
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }, 500);
  });
}

async function main() {
  const pages = findPages(args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--')));
  if (!pages.length) { console.log('No browser tests found (<project>/tests/browser/*.test.html).'); return 0; }
  const browser = findBrowser();
  if (!browser) { console.error('No Edge/Chrome found. Set BROWSER to a Chromium-based browser.'); return 2; }
  await new Promise((r) => server.listen(port, r));
  let failed = 0;
  for (const page of pages) {
    const out = await runPage(browser, page);
    console.log(`\n${page}`);
    if (out.timeout) { failed++; console.log(`  FAIL timed out after ${timeoutMs}ms (no results posted)`); continue; }
    for (const r of out.results) {
      if (!r.ok) failed++;
      console.log(`  ${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : `\n       ${r.error}`}`);
    }
  }
  server.close();
  console.log(`\n${failed ? `${failed} browser test(s) failed.` : 'All browser tests passed.'}`);
  return failed ? 1 : 0;
}

main().then((code) => setTimeout(() => process.exit(code), 700));
