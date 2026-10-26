---
name: pr-review
description: Automatic pre-review of a pull request once its work is final. It re-runs the quality gate, tests, browser tests and security scans, reviews the diff against the ticket's plan and the engineering standards (scope, correctness, tests, security, design, docs, hygiene), and posts a structured review on the PR. When run by factory-loop, it fixes blocking findings (up to 2 rounds), then marks the draft PR ready for the owner. It never approves or merges. Usage: /pr-review <PR number>.
---

# Automatic PR review

Run this when a PR's work is **final**: all commits pushed, the build done, screenshots attached. `factory-loop` runs it on its draft PRs before handing them to the owner. You can also run it by hand: `/pr-review <PR>`. Argument: `$ARGUMENTS` (the PR number; default is the PR for the current branch).

**Hard rules:** never approve, merge, dismiss reviews, force-push or close the PR. The owner decides.

## 1. Gather context

```
gh pr view <PR> --json number,title,body,isDraft,headRefName,baseRefName,files,commits,labels
gh pr diff <PR>
gh pr checks <PR>
```
- From `Closes #<N>` in the body, read the ticket: `gh issue view <N> --json comments`. Take the latest `factory:plan` comment (scope, files, security, acceptance checks, test plan) and any human feedback after it. This is what the PR is reviewed **against**.
- Check out the branch: `git switch <headRefName>`, then `git pull --ff-only`.
- If CI is still running, wait for it: `gh pr checks <PR> --watch`. A red CI is automatically a **blocker**.

## 2. Re-run the checks

```
node .claude/tools/quality-gate.js --base <baseRefName>
node .claude/tools/run-tests.js
node .claude/tools/browser-test.js          # when any <project>/tests/browser pages exist
```
Any ❌ is a **blocker**. Every ⚠️ needs a justification in the PR body, or it becomes a **minor** finding.

## 3. Review the diff

Go through each area. Only report what you have **confirmed by reading the code**: re-open the file at the line before reporting it. No speculative findings.

| Area | What to check |
|---|---|
| **Scope** | Matches the approved plan: nothing missing, nothing extra. No unrelated files or drive-by changes. Planned files only, plus README and `CLAUDE.md`. |
| **Correctness** | Logic errors, off-by-one, null/undefined paths, async ordering and races, error handling, and edge cases from the plan. For a deeper bug hunt, run the built-in `code-review` skill on the PR (`/code-review <PR>`) and fold in its confirmed findings. |
| **Tests** | Every acceptance check has an automated test (unit or browser). Bug fixes have a regression test. The TDD evidence is in the PR. **No weakened tests:** scan the diff for removed or loosened assertions, `.skip`, `.only`, `todo`, or deleted test files. Each of these is a blocker unless explained. |
| **Security** | Every user input reaches the DOM only through safe APIs (no `innerHTML`/`eval`). Inputs are validated at boundaries. No secrets. New dependencies are justified, pinned and scanned. Storage reads are treated as untrusted. CSP and `rel="noopener"` are where relevant. Compare against the plan's threat model, and check each mitigation is actually there. |
| **Design** | File and function limits (engineering-standards §3), one responsibility per module, no duplication, clear names, no dead or commented-out code, no stray `console.log`. |
| **Docs** | The project README reflects new behaviour. The `CLAUDE.md` index row is current. Every PR template section is filled. Screenshots exist for UI changes and the links resolve. |
| **Hygiene** | Commit messages reference the ticket. The PR is reasonably small (or the split is explained). `Closes #<N>` is present. No generated, temporary or local files committed. |

Grade each finding:
- **Blocker:** wrong behaviour, a security issue, a failing check, missing tests for an acceptance check, or weakened tests.
- **Major:** likely bug, missing edge case, breaks the plan, or a design-limit violation.
- **Minor:** clarity, docs, small structure issues.
- **Nit:** optional polish.

## 4. Post the review

Write the body to a scratchpad file, then post it as a comment review. The PR author can't approve their own PR, and approving is the owner's job anyway:
```
gh pr review <PR> --comment --body-file <file>
```
If that's refused, fall back to `gh pr comment <PR> --body-file <file>`.

Body format:
```
## 🤖 Automatic review: <✅ Ready for owner review | 🔧 Changes needed>

**Checks:** quality gate <✅/❌> · unit tests <n passed> · browser tests <n passed / n/a> · CI <✅/❌>

| Area | Result |
|---|---|
| Scope / Correctness / Tests / Security / Design / Docs / Hygiene | ✅ or the count of findings |

### Findings
1. **[Blocker]** `path/file.js:42`: what's wrong → suggested fix
2. **[Minor]** ...

(If there are none: "No findings.")

<!-- factory:auto-review -->
```

## 5. Act on the verdict (when run by factory-loop)

- **Blockers or majors:** fix them on the PR branch (test-first for bugs), push, and re-run this skill. Each round's review is posted. **At most 2 fix rounds.** If blockers or majors remain after that, leave the PR as a draft, add the `needs-attention` label (`gh label create needs-attention --color D93F0B` if it doesn't exist), and report the problem on the ticket.
- **Only minors or nits:** fix the cheap ones, list the rest in the review as follow-ups, then continue.
- **Ready:** mark it ready and hand it to the owner:
  ```
  gh pr ready <PR>
  gh pr edit <PR> --add-label awaiting-review
  ```
  Then `factory-loop` posts its `factory:review` comment on the ticket. The PR now waits for the owner's explicit go-ahead to merge.

When run by hand, stop after step 4 and summarize the verdict for the user.
