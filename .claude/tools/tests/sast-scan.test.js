const test = require('node:test');
const assert = require('node:assert/strict');
const { scanText } = require('../sast-scan');

const rules = (text, file = 'app.js') => scanText(text, file).map((f) => f.rule);

test('flags innerHTML / outerHTML assignment as high severity', () => {
  const [f] = scanText('el.innerHTML = userInput;', 'app.js');
  assert.equal(f.rule, 'inner-html');
  assert.equal(f.severity, 'high');
  assert.equal(f.line, 1);
  assert.deepEqual(rules('el.outerHTML += x;'), ['inner-html']);
});

test('does not flag safe DOM APIs or innerHTML comparisons', () => {
  assert.deepEqual(rules('el.textContent = userInput;'), []);
  assert.deepEqual(rules('if (el.innerHTML === "") {}'), []);
});

test('flags code-injection sinks', () => {
  assert.deepEqual(rules('eval(code)'), ['eval']);
  assert.deepEqual(rules('const f = new Function("a", body);'), ['new-function']);
  assert.deepEqual(rules('setTimeout("doIt()", 10)'), ['string-timer']);
  assert.deepEqual(rules('document.write(html)'), ['document-write']);
  assert.deepEqual(rules('el.insertAdjacentHTML("beforeend", html)'), ['insert-adjacent-html']);
});

test('does not flag method names that merely contain eval', () => {
  assert.deepEqual(rules('model.evaluate(x); retrieval(y);'), []);
  assert.deepEqual(rules('setTimeout(() => run(), 10)'), []);
});

test('flags shell command built from a template literal', () => {
  assert.deepEqual(rules('execSync(`git log ${branch}`)'), ['command-injection']);
  assert.deepEqual(rules('cp.exec(`rm ${path}`)'), ['command-injection']);
  assert.deepEqual(rules("execFileSync('git', ['log', branch])"), []);
});

test('does not scan comment lines for code patterns', () => {
  assert.deepEqual(rules('// GitHub lookups for the coverage eval (via the gh CLI)'), []);
  assert.deepEqual(rules('  * Never set el.innerHTML = data; use textContent'), []);
  assert.deepEqual(rules('/* eval(x) is dangerous */'), []);
  assert.deepEqual(rules('eval(code) // runs it'), ['eval']); // code before a trailing comment is still scanned
});

test('does not flag RegExp exec() on a template literal (a regex match, not a shell)', () => {
  assert.deepEqual(rules('const m = /# pass (\\d+)/.exec(`${r.stdout}${r.stderr}`);'), []);
  assert.deepEqual(rules('const m = PATTERN.exec(`${a}`); const n = /x/gi.exec(`${b}`);'), []);
});

test('flags insecure http URLs but not localhost', () => {
  assert.deepEqual(rules('fetch("http://api.example.com/x")'), ['insecure-http']);
  assert.deepEqual(rules('fetch("http://localhost:8780/")'), []);
  assert.deepEqual(rules('fetch("https://api.example.com/x")'), []);
});

test('flags secrets written to web storage', () => {
  assert.deepEqual(rules('localStorage.setItem("authToken", t)'), ['sensitive-storage']);
  assert.deepEqual(rules('localStorage.setItem("todo-filters", f)'), []);
});

test('html: target=_blank without rel=noopener, inline handlers, missing CSP', () => {
  const html = '<html><head><title>x</title></head>\n<a href="/x" target="_blank">x</a>\n<button onclick="go()">go</button>';
  const found = scanText(html, 'index.html').map((f) => `${f.rule}@${f.line}`);
  assert.ok(found.includes('blank-target-no-noopener@2'));
  assert.ok(found.includes('inline-event-handler@3'));
  assert.ok(found.includes('missing-csp@1'));
});

test('html: no findings when rel=noopener and CSP meta are present', () => {
  const html = '<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"></head>\n<a target="_blank" rel="noopener noreferrer" href="/x">x</a>';
  assert.deepEqual(scanText(html, 'index.html'), []);
});

test('JS rules are not applied to markdown', () => {
  assert.deepEqual(rules('Never do `el.innerHTML = x`', 'README.md'), []);
});

test('a sast-scan: allow comment suppresses findings on that line', () => {
  assert.deepEqual(rules('el.innerHTML = trustedTemplate; // sast-scan: allow (static string)'), []);
});
