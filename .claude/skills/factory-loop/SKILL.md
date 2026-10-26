---
name: factory-loop
description: The software-factory loop for this repo. Works through every open workshop ticket (GitHub issues titled "Ticket ..."), oldest first, and turns each into finished work on GitHub. It answers questions, makes file changes directly, and runs build work (new projects or features) through clarify → plan → approval → build → browser verification with screenshots. Every repo change lands as a PR assigned to the owner for review, and is never merged without their explicit go-ahead. Pass an issue number to process just that ticket.
---

# Factory loop

Tickets arrive as GitHub issues in this repo. This loop turns each one into **finished work on GitHub**. It doesn't just answer: if a ticket implies files, a project or a feature, the loop builds it. Run every `gh` command from the repo root. If `gh` is not on PATH, use `"C:\Program Files\GitHub CLI\gh.exe"`.

## Ground rules (always)

- **Never take a destructive action.** No `git push --force`, `git reset --hard`, `git clean`, history rewrites, branch deletes, or deleting files, folders, issues, comments or repos. Change existing files with targeted edits, not wholesale rewrites. If a ticket asks for something destructive, don't do it: comment explaining why, leave the ticket open for a human, and move on.
- Follow `README.md`: no Jonas or Contour code, and no real keys or secrets.
- Follow `CLAUDE.md`: one top-level folder per project, with a README, and one index row in `CLAUDE.md`.
- **Every repo change goes through a pull request.** Work on a ticket branch, open a PR to `main`, ask the repo owner to review it, and **never merge until they explicitly say so**. Don't commit ticket work to `main`. See **Branches and pull requests**.
- Only what is on GitHub counts. The Stop hook (`.claude/hooks/on-stop.sh`) commits anything left uncommitted at the end of every turn and pushes the *current branch*. So stay on the ticket branch while working, and make explicit `Ticket #<N>: ...` commits, because comments need the SHA.

## Conversation state lives in the ticket

Every comment the factory posts ends with a hidden marker naming its stage:

| Marker | Posted when |
|---|---|
| `<!-- factory:questions -->` | Clarifying questions and assumptions (build work, or an unclear ticket) |
| `<!-- factory:plan -->` | A plan awaiting approval |
| `<!-- factory:building -->` | Approved work that is built and pushed but not yet browser-verified (e.g. chrome-devtools MCP unavailable) |
| `<!-- factory:review -->` | Work is in an open PR, awaiting the owner's review and go-ahead to merge |
| `<!-- factory:done -->` | The final answer or report (questions), or the PR is merged |
| `<!-- factory:declined -->` | A refusal of destructive or out-of-rules work |

A **human reply** is any comment *without* a factory marker. Work out the ticket's state from the latest factory comment and whether a human reply follows it:

| Latest factory comment | Human reply after it? | State → action |
|---|---|---|
| none | – | **New** → acknowledge and classify (step b) |
| `questions` | no | **Waiting**. Skip silently: no new comment, no reaction |
| `questions` | yes | **Answered**. Write the plan, or ask follow-ups if it's still unclear |
| `plan` | no | **Waiting**. Skip silently |
| `plan` | yes, approving | **Approved** → build, verify, report |
| `plan` | yes, other feedback | **Revise**. Post an updated plan |
| `building` | – | **Verify pending**. If the chrome-devtools tools are available, resume at Build flow step 4 (don't rebuild). If not, skip silently |
| `review` | – | **In review**. Check the PR (see **Handling a PR in review**): merged → wrap up; change requests → address them on the branch; a merge go-ahead from the owner → merge; otherwise skip silently |
| `done` / `declined` | yes | **Reopened conversation**. Treat the reply as a follow-up request |

An approval is a human reply that clearly says yes: "approved", "approve", "lgtm", "go ahead", "ship it", "yes". If it approves *with* changes, fold the changes into the build and list them in the report.

## The loop

1. **Get the queue.** If an issue number was given (`$ARGUMENTS`), the queue is just that issue. Otherwise:
   ```
   gh issue list --state open --search "Ticket in:title sort:created-asc" --json number,title,createdAt
   ```
   If it is empty, report "No open tickets" and stop.
2. **Process each ticket in order**, finishing one (including commit and push) before the next. Waiting tickets are skipped silently.
3. **Re-check the queue** when the list is done. If new tickets have arrived, go back to step 2. Otherwise write the summary.

## Per-ticket steps

### a. Read

```
gh issue view <N> --json number,title,body,author,labels,comments,state
```

Read the title, body and **all comments**, then work out the state (table above). Skip closed tickets.

### b. Acknowledge (new tickets only)

```
gh api --method POST 'repos/{owner}/{repo}/issues/<N>/reactions' -f content=eyes
```

Keep the single quotes: without them PowerShell reads `{owner}`/`{repo}` as script blocks and the command fails with "The command parameter was already specified".

### c. Classify and act

| Kind | Examples | What to do |
|---|---|---|
| **Question** | facts, explanations, comparisons | Answer it accurately, name the source, and say when a figure is from memory rather than a live lookup. If the answer belongs in the repo ("document X", "write a guide"), also create the file. Then reply and close. |
| **Small change** | create or edit files, docs, config, a bug fix, a rename, a project skeleton with no features | Do it with no plan/approval step, but still on a ticket branch: run the relevant checks, commit, push and open a PR. Reply with a `factory:review` comment linking it. Leave the ticket open; the merge closes it. |
| **Build** | a new project or app, or a new user-facing feature in an existing project | Follow the **Build flow** below. |
| **Unclear** | missing the information needed to act | Post specific questions (`factory:questions`) and leave the ticket open. |
| **Destructive** | delete, wipe, force-push, remove history | Decline (`factory:declined`) with the reason. Leave the ticket open. |

## Build flow

### 1. Clarify (stage `questions`)

Before writing any code, post one comment:
- **Understanding:** the request restated in one or two lines.
- **Assumptions:** each with the default you'll use, e.g. "Storage: IndexedDB in the browser. No server."
- **Questions:** numbered, specific, and only ones whose answers change what gets built.
- End with: "Reply with answers, or **ok** to accept the defaults." and the marker.

Leave the ticket open and move on.

### 2. Plan (stage `plan`)

After the reply, post the plan:
- **Goal** and **scope**: what is in, and what is explicitly out.
- **Location:** the project folder (new top-level folder, or the existing project).
- **Files:** each file to add or change, with its purpose.
- **Design:** data model, UI or behaviour, and key decisions.
- **Acceptance checks:** numbered and observable in the browser. These drive verification.
- End with: "Reply **approved** to start, or comment changes." and the marker.

Leave the ticket open. Don't build until there is an approval.

### 3. Build

- Create or switch to the ticket branch first (see **Branches and pull requests**).
- Work only in the planned folder(s), plus the `CLAUDE.md` index row and the project README.
- Keep to the approved plan. If it has to change, note the change for the report. If the change is significant, post a revised plan and wait again.
- Run any available checks (lint, `node --check`, tests).

### 4. Verify in the browser (chrome-devtools MCP)

1. Serve the project: `node .claude/tools/serve.js <project-folder> 8780` (run it in the background).
2. Use the `chrome-devtools` MCP tools to open `http://localhost:8780/`. For **each acceptance check**, do it for real: fill inputs, click, reload to test persistence.
3. Check the console messages and failed network requests. Any error means a failing check: fix it and re-verify.
4. Take a screenshot per key state with the screenshot tool, saving to `<project>/screenshots/ticket-<N>-<nn>-<what>.png` (for example `ticket-4-01-empty.png` or `ticket-4-02-added.png`).
5. Stop the server when done.

If the chrome-devtools tools are unavailable, don't open the PR for review yet. Commit and push the build to the ticket branch as `Ticket #<N>: ...`, then post a `factory:building` comment. It should give the SHA, the results of any headless fallback checks (clearly labelled as headless, not browser-verified), and a note that browser verification and screenshots will follow once the MCP server is connected. Never claim browser verification that didn't happen.

### 5. Commit, push, open the PR (stage `review`)

1. On the ticket branch, commit the project, screenshots and `CLAUDE.md` together as `Ticket #<N>: <summary>`, then push the branch.
2. Get the repo name and SHA: `gh repo view --json nameWithOwner -q .nameWithOwner` and `git rev-parse HEAD`.
3. Open the PR (see **Branches and pull requests**). Its body holds the report:
   - what was built and where
   - the acceptance checks, each ✅/❌, with how each was verified
   - the screenshots, embedded as `![<what>](https://github.com/<owner>/<repo>/blob/<sha>/<path>?raw=true)`
   - the files touched, and any assumptions or plan changes
   - `Closes #<N>`
4. Reply on the ticket with **Ready for review:** and the PR link, plus a one-line summary, ending with `<!-- factory:review -->`. **Don't close the ticket.** Merging the PR closes it.

## Branches and pull requests

**Branch.** Use one branch per ticket: `ticket-<N>-<short-slug>`, for example `ticket-5-filters-tags`.
- New branch: `git switch main`, then `git pull --ff-only`, then `git switch -c ticket-<N>-<slug>`.
- Existing branch (revisions, review fixes): `git switch ticket-<N>-<slug>`, then `git pull --ff-only`.
- When the ticket's work for this run is pushed, switch back: `git switch main`.
- Never rebase, force-push or delete branches.

**Open the PR** (once per ticket, after the first push of the branch). Write the body to a scratchpad file first:
```
gh pr create --base main --head ticket-<N>-<slug> --title "Ticket #<N>: <summary>" --body-file <file> --reviewer <owner-login> --assignee <owner-login> --label awaiting-review
```
- `<owner-login>` is the repo owner: `gh repo view --json owner -q .owner.login`.
- If the `awaiting-review` label doesn't exist yet, create it once: `gh label create awaiting-review --color FBCA04 --description "Factory PR waiting for owner review"`.
- GitHub refuses to request a review from the PR's author. When the factory runs as the owner's account, `--reviewer` fails with that error. Retry without `--reviewer`; the assignee and the `awaiting-review` label mark it for the owner. Mention this in the ticket reply.
- If a PR for the branch already exists (`gh pr list --head <branch>`), push to it and comment on it instead of opening another.

**Never merge on your own.** `gh pr merge` needs an **explicit go-ahead from the owner** given in this session, on the PR, or on the ticket: "merge", "merge it", "ship it" (after review), or an approving review that also says to merge. An approving review alone, a 👍, or silence is **not** a go-ahead. Settings also make `gh pr merge` prompt for permission.

### Handling a PR in review

For a ticket whose latest factory comment is `review`, check `gh pr view <branch> --json state,reviews,comments,reviewDecision` and the ticket's comments after the `review` marker:

| PR state | What to do |
|---|---|
| **Merged** | Confirm the ticket closed (`gh issue view <N> --json state`). If it didn't, close it with `--reason completed`. Post a short `factory:done` comment on the ticket. Switch to `main` and `git pull --ff-only`. |
| **Change requests** (review comments, "changes requested", or a human comment asking for edits) | Switch to the branch, make the changes, re-verify the affected acceptance checks in the browser (with new screenshots if the UI changed), commit, and push. Reply on the PR listing what changed, then post a fresh `factory:review` comment on the ticket. |
| **Merge go-ahead from the owner** | Run `gh pr merge <PR> --squash`. Keep the branch: no `--delete-branch`. Then do what the **Merged** row says. |
| **Closed without merging** | Leave the ticket open. Post a `factory:declined`-style note asking what to do next, but only once. |
| Anything else | Waiting. Skip silently. |

## Posting comments

Write each comment body to a file in the scratchpad first, then `gh issue comment <N> --body-file <file>`. This avoids PowerShell quoting problems. The last line of every factory comment is its stage marker. Never post a comment that repeats one already on the ticket.

## Summary

End the run with one row per ticket you touched (waiting tickets that were skipped can be counted in one line):

| Ticket | Title | Outcome | Comment link |
|---|---|---|---|

Outcome is one of **Closed**, **Questions posted**, **Plan posted**, **Plan revised**, **Built, awaiting verification**, **PR opened**, **PR updated**, **Merged**, **Declined**, **Blocked (reason)** or **Skipped (already closed)**. List any commits pushed and PRs opened, with links.
