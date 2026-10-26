---
name: engineering-standards
description: Engineering standards for all code the factory writes. Covers security by design (threat model and security section in plans), test-driven development (red, green, refactor, and never weakening tests), design limits (no god objects or files, single responsibility), small PRs, the quality gate (tests, lint, secret and dependency scans), and the self-review checklist before a PR. Load before planning or building any code change.
---

# Engineering standards

These standards apply to every change the factory makes. `factory-loop` links here from its plan, build and PR steps. They're based on the NIST SSDF (SP 800-218), OWASP SAMM/DevSecOps guidance, DORA research on small batches, and agentic-TDD practice.

## 1. Plan: security and tests by design

Every build plan must include these sections:
- **Security:**
  - the data handled and where it's stored
  - trust boundaries, such as user input, URLs, external APIs and files
  - how inputs are validated or escaped
  - secrets and auth (if any), and how they're kept out of the repo
- **Threat model:** for anything that accepts input or stores data, list 3–5 "what could go wrong" items, each with its mitigation. For example: "HTML in a task title → XSS → render with `textContent`, never `innerHTML`."
- **Test plan:** every acceptance check maps to at least one automated test, plus any edge cases. Name the test file.
- **Size:** if the work looks bigger than about 400 changed lines or about 10 files, split it into smaller tickets or PRs and say so in the plan.

## 2. Build: test-driven development

Work in small red → green → refactor cycles, one behaviour at a time:

1. **Red:** write one test for the next behaviour, then **run it and see it fail** for the expected reason. A new test that passes straight away isn't testing the new behaviour: fix the test.
2. **Green:** write the minimum code that makes it pass, with no extra features and nothing speculative.
3. **Refactor:** clean up names, duplication and structure while all tests stay green. Re-run them after each refactor.
4. Repeat until every acceptance check has a passing test.

Rules:
- **Never weaken, skip, delete or `.only` a test to get green.** If a test is wrong, say why in the PR and fix it deliberately.
- **Bug fixes start with a failing test** that reproduces the bug.
- Keep pure logic (parsing, sorting, filtering, validation) in modules separate from DOM, network and storage code, so it can be unit-tested with `node --test` and no browser.
- **Test setup per project:** add a `package.json` with `"test": "node --test tests/"`, and put tests in `<project>/tests/*.test.js` (or `.mjs`). That needs Node 18+: run with `C:\Users\FARHAMEH\AppData\Local\Author Software\nvm\installs\v20.20.2\node.exe` locally, since the default `node` is v14. CI uses Node 20.
- Browser behaviour is still verified end to end with the chrome-devtools MCP (factory-loop step 4). Unit tests and browser checks complement each other.

## 3. Design limits: no god objects

| Rule | Limit |
|---|---|
| File size | Code files **≤ 200 lines** (the gate warns above 200 and fails above 300). Markup and CSS: warns above 400, fails above 600. |
| Function size | Aim for **≤ 40 lines** and one level of abstraction per function. |
| Single responsibility | Each module does one thing you can name without "and" (for example `db.js` = storage, `filters.js` = filter logic, `app.js` = wiring the UI). |
| Coupling | Modules talk through small exported functions, never by reaching into each other's internals or globals. |
| Duplication | Extract shared code when it repeats a third time, not before. |
| Dependencies | Prefer the platform (DOM, `fetch`, IndexedDB, `node:test`) over packages. Every new dependency needs a reason in the PR. Pin versions and commit the lockfile. |

When a file approaches its limit, split it by responsibility as part of the current change. Don't leave it for later.

## 4. Secure coding defaults

- Render user content with `textContent` and other safe DOM APIs. Never use `innerHTML`, `eval` or `new Function` on data.
- Validate input at boundaries: types, lengths and allowed values. Fail closed.
- Never commit secrets. Read config from environment variables, and add `.env*` to `.gitignore`. Test fixtures that look like keys need a `secret-scan: allow` comment on the line.
- Wrap `localStorage` and other storage access in `try/catch`. Treat stored data as untrusted when reading it back.
- Show errors to users without stack traces, and log details only to the console.

## 5. Before opening a PR

1. **Run the quality gate** from the repo root:
   ```
   node .claude/tools/quality-gate.js --base main
   ```
   It checks syntax, file size, tests, lint, secrets (gitleaks, or a built-in scan), dependencies (osv-scanner or `npm audit`), and change size. **Any ❌ FAIL blocks the PR.** Fix the problem and re-run. ⚠️ WARN rows are allowed but must be explained in the PR. Paste the gate's table into the PR body.
2. **Self-review the diff** (`git diff main...HEAD`) against this checklist:
   - [ ] It does what the plan and acceptance checks say, and nothing more.
   - [ ] Every behaviour has a test, and the tests failed before the fix.
   - [ ] No god files or functions, clear names, no dead or commented-out code.
   - [ ] User input is escaped or validated, there are no secrets, and errors are handled.
   - [ ] README and `CLAUDE.md` index are updated if behaviour or structure changed.
   - [ ] Screenshots are present for UI changes.
3. Fill in `.github/pull_request_template.md`. CI (`.github/workflows/quality-gate.yml`) re-runs the gate with gitleaks and osv-scanner on every PR.

## Tools

| Tool | Purpose | Local status |
|---|---|---|
| `node .claude/tools/quality-gate.js` | All checks in one table | Built in |
| `node .claude/tools/secret-scan.js <files>` | Quick secret scan (also run by the Stop hook before committing) | Built in |
| gitleaks | Full secret scan of the working tree and history | Optional locally (`winget install Gitleaks.Gitleaks`). Always runs in CI |
| osv-scanner | Known vulnerabilities in lockfiles | Optional locally (`winget install Google.OSVScanner`). Runs in CI when lockfiles exist |
| ESLint | Lint, with `max-lines`, `max-lines-per-function` and `complexity` rules | Per project, when it has a config |
