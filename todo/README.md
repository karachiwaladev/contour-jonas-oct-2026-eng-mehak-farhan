# Todo

A simple todo app that runs entirely in the browser. Tasks are stored in a client-side
database (IndexedDB), so they persist across reloads with no server.

## Features

- Create a task, optionally with a **due date and time** and comma-separated **tags**
  (tags are trimmed, lowercased and de-duplicated)
- Mark a task done (or undo it)
- Delete a task
- **Status filter**: All / Incomplete / Completed, with counts
- **Tag filter**: select one or more tags to show tasks having *any* of them; combines with the status filter
- Overdue open tasks are highlighted in red, and tasks due today are labelled "Today"
- Open tasks are sorted by due date (undated after), with completed tasks last
- Selected filters are remembered across reloads (in `localStorage`)
- **Recurring tasks:** choose Repeat (Daily, Weekly or Monthly) when adding a task. Ticking it done keeps it
  as history and creates the next occurrence, with the same title, tags and repeat setting, due one period after
  the previous due date (or one period from now if it had none). Missed periods are skipped so the next
  one is never overdue. Monthly repeats keep the day of the month, clamped to shorter months (Jan 31 → Feb 28).
  Unticking and re-ticking doesn't create duplicates, and deleting the open occurrence ends the series.

- **Priority:** High, Medium or Low (default Medium) on each task, shown as a colored badge. Open tasks sort by
  priority, then due date. The **Priority** chips filter by any selected priority, combine with the other filters and
  are remembered after a reload. Older tasks without a priority count as Medium. Recurring tasks keep their priority.
- **Edit:** each task has an **Edit** button that opens an inline form for its title, due date, tags, repeat and
  priority, with **Save** and **Cancel**. An empty title is rejected.
- **Task counts:** a footer under the list shows totals for all tasks, e.g. "3 open · 5 done". Filters don't change
  it, a completed recurring occurrence counts as done, and it updates on every add, tick, edit and delete.
- **Search:** a search box above the filters narrows the list as you type. It matches the title and tags,
  case-insensitively, and with several words every word must match. It combines with the status, tag and priority
  filters. Escape or emptying the box clears it, and it is not remembered after a reload.

## Tests

- Unit tests: `cd todo && npm test` (uses Node 18+ automatically via `.claude/tools/run-tests.js`)
- Browser tests: `node .claude/tools/browser-test.js` (app, recurring, priority, edit, counts, search and error-path suites)
- Coverage: `cd todo && npm run coverage` gives unit coverage, then browser line coverage per file (100% at last run)
- Error paths are tested for real: `tests/browser/errors.test.html` makes IndexedDB fail and checks the user sees a message

## Run it

Open `index.html` in a browser. No build step or dependencies are needed.
Serving the folder also works, e.g. `npx serve todo`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page markup |
| `db.js` | IndexedDB wrapper (`TaskDB.all/add/get/put/remove`) |
| `app.js` | Event wiring: add, toggle (creates the next recurring occurrence), delete, filters |
| `filters.js` | Pure logic: tag parsing, sorting, filtering, due labels, saved-filter loading, task counts |
| `search.js` | Pure logic: search query parsing and title/tag matching |
| `recurrence.js` | Pure logic: repeat patterns, next due date, next occurrence |
| `render.js` | DOM building (`textContent` only) |
| `priority.js` | Pure logic: priority levels, allowlist, sort rank, labels |
| `editor.js` | Inline edit form: builds it prefilled, reads back validated values |
| `tests/` | `node:test` unit tests, plus `tests/browser/` headless browser tests |
| `screenshots/` | Browser verification screenshots, per ticket |
| `style.css` | Styles, with light and dark themes |

Data lives in the `todo-app` IndexedDB database, in the `tasks` store, in the browser that opened the page.
