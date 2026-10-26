---
name: factory-loop
description: The software-factory loop for this repo. Works through every open workshop ticket (GitHub issues titled "Ticket #N"), oldest first. For each one it acknowledges, does the work, replies with a comment, and closes the ticket, then repeats until the queue is empty. Use when asked to run the loop, process tickets, handle the next ticket, or clear the queue.
argument-hint: "[issue number]  (optional; handles only that ticket instead of the whole queue)"
---

# Factory loop

Tickets arrive as GitHub issues in this repo. This skill is the loop that turns each one into finished work on GitHub. Run every `gh` command from the repo root so `gh` targets this repo automatically. If `gh` is not on PATH, use `"C:\Program Files\GitHub CLI\gh.exe"`.

## The loop

1. **Get the queue.**
   - If an issue number was given (`$ARGUMENTS`), the queue is just that issue.
   - Otherwise fetch every open ticket, oldest first:
     ```
     gh issue list --state open --search "Ticket in:title sort:created-asc" --json number,title,createdAt
     ```
   - If the queue is empty, report "No open tickets" and stop.
2. **Process each ticket in order** using the steps below. Finish one ticket completely, including any commit and push, before starting the next.
3. **Re-check the queue** once the current list is done. New tickets may have arrived while you worked. If there are new ones, go back to step 2. If not, go to the summary.

## Per-ticket steps

### a. Read

```
gh issue view <N> --json number,title,body,author,labels,comments,state
```

Read the title, body, **and all comments**, because later comments can change the request. Skip the ticket if it's already closed.

### b. Acknowledge

React with 👀 so the author can see it was picked up:

```
gh api --method POST 'repos/{owner}/{repo}/issues/<N>/reactions' -f content=eyes
```

Keep the single quotes. Without them, PowerShell reads `{owner}` and `{repo}` as script blocks, and the command fails with "The command parameter was already specified".

### c. Do the work

- **Question:** answer it accurately. Name your source, and say when a figure comes from memory rather than a live lookup.
- **Code or file change:** make the change in this repo, run any relevant checks, then commit with a message that references the ticket (`Ticket #<N>: ...`) and push to `main`. Only what is on GitHub is scored.
- **Unclear or ambiguous:** do not guess. Post a specific clarifying question as a comment, leave the issue open, and move on to the next ticket.

Follow the ground rules in `README.md`: no Jonas or Contour code, and no real keys.

### d. Reply

Write the comment body to a temporary file first; this avoids quoting problems in PowerShell. Then post it:

```
gh issue comment <N> --body-file <file>
```

Structure the comment like this:

- **Answer** or **Done:** the result, in one or two lines.
- Supporting details: figures, sources, or what changed, including the commit SHA and the files touched for code work.
- Any assumptions you made.

### e. Close

Close the ticket only when the work is complete:

```
gh issue close <N> --reason completed
```

Confirm with `gh issue view <N> --json state,stateReason`.

## Summary

When the loop ends, report a table with one row per ticket processed:

| Ticket | Title | Outcome | Comment link |
|---|---|---|---|

Outcome is **Closed**, **Needs clarification**, or **Skipped (already closed)**. Also list any commits pushed.
