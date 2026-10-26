// In-browser test harness used by <project>/tests/browser/*.test.html and run by browser-test.js.
// Loads the real app page in an iframe (same origin), drives it, and reports results to the runner.
// API (global FactoryTest):
//   test(name, async fn)             register a test (they run in order, sharing one iframe)
//   open(url) / reload()             load the app, or reload it to test persistence
//   $(sel) / $$(sel) / win() / doc() query the app
//   fill(sel, value) / click(sel) / submit(sel) / check(sel, bool)
//   until(fn, label, ms = 5000)      wait until fn() is truthy
//   expect(cond, message)            assert inside a test
(function () {
  const tests = [];
  const pageErrors = [];
  let frame;

  function ensureFrame() {
    if (frame) return frame;
    frame = document.createElement('iframe');
    frame.style.cssText = 'width:420px;height:800px;border:1px solid #ccc';
    document.body.prepend(frame);
    return frame;
  }

  function hookErrors(w) {
    w.addEventListener('error', (e) => pageErrors.push(`error: ${e.message}`));
    w.addEventListener('unhandledrejection', (e) => pageErrors.push(`unhandled rejection: ${e.reason}`));
    const original = w.console.error.bind(w.console);
    w.console.error = (...a) => { pageErrors.push(`console.error: ${a.join(' ')}`); original(...a); };
  }

  function load(navigate) {
    const f = ensureFrame();
    return new Promise((resolve) => {
      f.onload = () => { hookErrors(f.contentWindow); resolve(f.contentWindow); };
      navigate(f);
    });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const api = {
    test: (name, fn) => tests.push({ name, fn }),
    open: (url) => load((f) => { f.src = url; }),
    reload: () => load((f) => f.contentWindow.location.reload()),
    win: () => frame.contentWindow,
    doc: () => frame.contentDocument,
    $: (sel) => frame.contentDocument.querySelector(sel),
    $$: (sel) => [...frame.contentDocument.querySelectorAll(sel)],
    async until(fn, label = 'condition', ms = 5000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        try { if (fn()) return; } catch {}
        await sleep(20);
      }
      throw new Error(`timed out after ${ms}ms waiting for ${label}`);
    },
    expect(cond, message) { if (!cond) throw new Error(message || 'expectation failed'); },
    fill(sel, value) {
      const el = api.$(sel);
      api.expect(el, `no element ${sel}`);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    click(sel) { const el = api.$(sel); api.expect(el, `no element ${sel}`); el.click(); },
    submit(sel) { const el = api.$(sel); api.expect(el, `no form ${sel}`); el.requestSubmit(); },
    check(sel, on = true) {
      const el = api.$(sel);
      api.expect(el, `no element ${sel}`);
      el.checked = on;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
  };

  async function run() {
    const results = [];
    for (const t of tests) {
      const before = pageErrors.length;
      try {
        await t.fn(api);
        const errs = pageErrors.slice(before);
        results.push(errs.length ? { name: t.name, ok: false, error: errs.join(' | ') } : { name: t.name, ok: true });
      } catch (e) {
        results.push({ name: t.name, ok: false, error: e.message });
      }
    }
    const pre = document.createElement('pre');
    pre.id = 'factory-results';
    pre.textContent = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` (${r.error})`}`).join('\n');
    document.body.append(pre);
    await fetch('/__result', { method: 'POST', body: JSON.stringify({ page: location.pathname, results }) }).catch(() => {});
  }

  window.FactoryTest = api;
  // Tests register synchronously in the page's own script; run them once the page has loaded.
  window.addEventListener('load', () => setTimeout(run, 0));
})();
