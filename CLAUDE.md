# Software Factory

This repo is a **software factory**: a loop that turns incoming tickets (GitHub issues)
into finished work on GitHub. We build and improve the factory, not one-off features.
Each piece of work the factory produces lives in its own project folder.

> Hard limit: keep this file **under 100 lines**. It is an index, not a manual.

## Progressive disclosure

Load context in layers. Read only as deep as the current task needs.

1. **This file** (always loaded). Shows what the factory is, the rules, and where everything is.
2. **Project README** (`projects/<name>/README.md`). Read it only when a ticket touches that project.
3. **Project internals** (code, docs, tests). Open them only for the specific change in hand.

Rules that follow from this:
- Do not inline project details here. Add one index row that links to the project's README.
- Put deep or long-form guidance in the project folder or in a skill, not in this file.
- If this file nears 100 lines, move detail down a layer rather than adding more here.

## How the factory runs

- Tickets arrive as GitHub issues titled `Ticket ...`.
- The loop lives in the skill `.claude/skills/factory-loop/SKILL.md` (run it with `/factory-loop`).
- For each ticket: read it with all comments, react 👀, do the work, reply, then close it.
- Ambiguous tickets get a clarifying comment and stay open. Never guess.
- Code changes are committed as `Ticket #<N>: <summary>` and pushed to `main`.
  Only what is on GitHub counts.

## Repo layout

```
CLAUDE.md                 # this index (under 100 lines)
README.md                 # workshop info and scoring
.claude/skills/           # factory skills (the loop itself)
projects/<name>/          # one folder per project
  README.md               # layer-2 entry point for that project
```

## Adding a project

1. Create `projects/<kebab-case-name>/` with a short `README.md`
   (purpose, how to run or check it, key files).
2. Add one row to the index below. Keep each row to a single line.
3. Do not mix projects. Shared code needs its own project folder.

## Project index

| Project | Path | Summary | Ticket |
|---|---|---|---|
| _none yet_ | | | |

## Ground rules

- Training repo only: no Jonas or Contour code, and no real keys or secrets.
- Answer questions with sources, and say when a figure comes from memory.
- Keep commits small and tied to a ticket.
