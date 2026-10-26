# Software Factory

This repo is a **software factory**: a loop that turns incoming tickets (GitHub issues)
into finished work on GitHub. We build and improve the factory, not one-off features.
Each piece of work the factory produces lives in its own project folder.

> Hard limit: keep this file **under 100 lines**. It is an index, not a manual.

## Progressive disclosure

Load context in layers. Read only as deep as the current task needs.

1. **This file** (always loaded). Shows what the factory is, the rules, and where everything is.
2. **Project README** (`<name>/README.md`). Read it only when a ticket touches that project.
3. **Project internals** (code, docs, tests). Open them only for the specific change in hand.

Rules that follow from this:
- Do not inline project details here. Add one index row that links to the project's README.
- Put deep or long-form guidance in the project folder or in a skill, not in this file.
- If this file nears 100 lines, move detail down a layer rather than adding more here.

## How the factory runs

- Tickets arrive as GitHub issues titled `Ticket ...`.
- The loop lives in the skill `.claude/skills/factory-loop/SKILL.md` (run it with `/factory-loop`).
- The loop acts, not just answers. Questions get answered. Small changes are made directly.
  Build work (a new project or feature) goes **clarify → plan → approval → build → browser
  verify** (chrome-devtools MCP), and the report includes screenshots.
- Ticket state is tracked by hidden `<!-- factory:<stage> -->` markers on the factory's comments.
- **Never destructive:** no force-push, hard reset, clean, or deleting files, issues or repos.
  Deny rules in `.claude/settings.json` enforce this.
- Ticket work goes on a `ticket-<N>-<slug>` branch and lands as a **PR** for the owner to review.
  It is **never merged without the owner's explicit go-ahead**, and `gh pr merge` always prompts.
- All code follows the `engineering-standards` skill: a security section and threat model in each plan,
  TDD, no god objects (code files ≤ 200 lines), and small PRs. `quality-gate.js` must pass before a PR, and CI re-runs it
  (plus gitleaks, semgrep and CodeQL). The `testing` skill holds the test tools, and the `pr-review` skill auto-reviews each draft PR before handover.
- The Stop hook logs prompts to `.claude/prompts.jsonl`, holds back files that look like secrets,
  then commits and pushes the current branch.

## Repo layout

```
CLAUDE.md                 # this index (under 100 lines)
README.md                 # workshop info and scoring
.claude/skills/           # factory skills (the loop itself)
.claude/hooks/            # Stop hook: prompt log + auto-commit/push
.claude/tools/serve.js    # static server used for browser verification
.claude/tools/            # quality-gate, run-tests, browser-test, browser-coverage, new-test, scans
.github/                  # PR template, CI (gate, tests, CodeQL), Dependabot
<name>/                   # one top-level folder per project
  README.md               # layer-2 entry point for that project
  tests/                  # node --test unit tests (TDD)
  screenshots/            # verification screenshots, ticket-<N>-*.png
```

## Adding a project

1. Create a top-level `<kebab-case-name>/` folder with a short `README.md`
   (purpose, how to run or check it, key files).
2. Add one row to the index below. Keep each row to a single line.
3. Do not mix projects. Shared code needs its own project folder.

## Project index

| Project | Path | Summary | Ticket |
|---|---|---|---|
| Todo app | [`todo/`](todo/README.md) | Browser todo list on IndexedDB: due dates, tags, filters, recurring tasks | #4, #5, #6 |

## Ground rules

- Training repo only: no Jonas or Contour code, and no real keys or secrets.
- Answer questions with sources, and say when a figure comes from memory.
- Keep commits small and tied to a ticket.
