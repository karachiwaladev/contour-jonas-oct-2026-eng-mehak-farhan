---
name: testing
description: How to write and run tests in this repo. Covers making code testable, scaffolding tests (new-test.js), unit tests with node:test (run-tests.js, which finds Node 18+ even when the default node is older), browser tests against the real page (browser-harness.js and browser-test.js in headless Edge/Chrome), and coverage. Use while doing TDD for a ticket, fixing a bug test-first, or adding tests to an existing project.
---

# Testing

Use this with the TDD rules in `engineering-standards` §2: write one test, see it fail, make it pass, refactor. All commands run from the repo root.

## Tools

| Task | Command |
|---|---|
| Scaffold a unit test | `node .claude/tools/new-test.js <project> <module>` → `<project>/tests/<module>.test.js` |
| Scaffold a browser test | `node .claude/tools/new-test.js <project> <name> --browser` → `<project>/tests/browser/<name>.test.html` |
| Run unit tests | `node .claude/tools/run-tests.js [<project>/tests]` (no argument runs every project's tests plus the factory's own) |
| Run with coverage | `node .claude/tools/run-tests.js <project>/tests --coverage` |
| Run browser tests | `node .claude/tools/browser-test.js [<page>.test.html]` (no argument runs every `<project>/tests/browser/*.test.html`) |
| Browser coverage | `node .claude/tools/browser-coverage.js [--min 80] [--warn 90]`: line coverage per source file from the browser tests (V8 coverage over the DevTools protocol). Exits 1 if any file is below `--min` or a test fails |
| Everything, as the PR gate sees it | `node .claude/tools/quality-gate.js --base main` |

`new-test.js` never overwrites an existing file. `run-tests.js` picks the newest Node 18+ it can find (this machine's default `node` is v14). Set `FACTORY_NODE` to override.

## 1. Make the code testable first

Tests are easy when logic is separate from the DOM, storage and network:
- Put pure logic in its own file, for example `filters.js` for parsing, sorting and filtering. Wire it to the page in `app.js`.
- Plain browser scripts (no bundler) can still be `require`d by Node tests if they end with:
  ```js
  const Filters = (() => {
    function parseTags(text) { /* ... */ }
    return { parseTags };
  })();
  if (typeof module !== 'undefined') module.exports = Filters; // Node tests; ignored in the browser
  ```
- Pass dependencies in (`now = new Date()`, a storage object) instead of reaching for globals, so tests can control them.

## 2. Unit tests (node:test)

- Put them in `<project>/tests/<module>.test.js`, one file per module.
- Give each test **one behaviour**, named in plain words: `parseTags: drops empty and duplicate tags`.
- Arrange → act → assert, using `node:assert/strict`.
- Cover the happy path, edge cases (empty, max length, duplicates, invalid input) and every bug you fix (a regression test first).
- No network, no real time and no randomness: inject them.
- Add `<project>/package.json` with `{ "private": true, "scripts": { "test": "node --test tests/" } }` so CI and the gate run it.

## 3. Browser tests (real page, headless)

Use these for behaviour that needs the DOM, IndexedDB/localStorage or reloads. They complement the chrome-devtools MCP verification in `factory-loop` step 4. They're automated and re-runnable in CI, while the MCP pass produces the screenshots.

- The page includes `/.claude/tools/browser-harness.js` and registers tests with `FactoryTest.test(name, async fn)`.
- Helpers: `open(url)`, `reload()`, `$`, `$$`, `fill`, `click`, `submit`, `check`, `until(fn, label)` and `expect(cond, msg)`.
- Tests run in order against one iframe, so later tests see earlier state. Reset any filters a previous test turned on.
- Any page error, unhandled rejection or `console.error` during a test fails it.
- Each run uses a fresh private browser profile, so storage starts empty.
- A worked example against the todo app: `.claude/skills/testing/examples/todo-smoke.test.html`.

## 4. Golden sets

A golden set is a fixed list of known-hard cases with expected results, kept in `<project>/tests/golden/*.json` and run against the project's pure modules. It must stay at **100%**.
- **Run it:** `node .claude/tools/evals/golden.js [<project>]`. The ticket eval also runs it.
- **Format:** `{ "module": "recurrence.js", "cases": [{ "id", "fn", "args": [...], "expect": ..., "why" }] }`. Use `{ "$date": "YYYY-MM-DDTHH:mm" }` for a local `Date` argument.
- **What goes in:** boundaries (month ends, leap years, year rollover), tampered or invalid input, threat-model cases, and **every bug that gets fixed** (its `why` names the PR or ticket).
- **Never edit an expected value to make a case pass.** If behaviour is meant to change, say so in the PR.

## 5. Coverage

- **Targets:** at least **80% lines per file** (CI fails below this), and aim for **90%+**. Unit coverage (`run-tests.js --coverage`) measures the pure modules. Browser coverage measures everything the pages load.
- **Coverage shows what never ran, not what's correct.** Use it to find untested paths, especially error handling: storage blocked, the database failing, network errors. Test those for real. For example, `todo/tests/browser/errors.test.html` makes IndexedDB fail with a genuine `VersionError`.
- **Line coverage can't see unfired callbacks.** The line that assigns an error handler counts as covered even if the handler never runs. Say so in the PR when it matters.
- **Never write tests just to raise the number.** Each test must check a behaviour.

## 6. Rules

- Never weaken, skip, `.only` or delete a test to get green. If a test is wrong, fix it deliberately and say why in the PR.
- A new test that passes before the code exists isn't testing the new behaviour.
- Keep tests fast (under a second per unit test file) and independent of order (unit tests).
- Test files are exempt from the file-size limit, but split them by module when they grow.
