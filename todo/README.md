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

Due date, tags and repeat are set when a task is created. Editing them later isn't supported yet.

## Tests

- Unit tests: `cd todo && npm test` (uses Node 18+ automatically via `.claude/tools/run-tests.js`)
- Browser tests: `node .claude/tools/browser-test.js todo/tests/browser/app.test.html todo/tests/browser/recurring.test.html`

## Run it

Open `index.html` in a browser. No build step or dependencies are needed.
Serving the folder also works, e.g. `npx serve todo`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page markup |
| `db.js` | IndexedDB wrapper (`TaskDB.all/add/get/put/remove`) |
| `app.js` | Event wiring: add, toggle (creates the next recurring occurrence), delete, filters |
| `filters.js` | Pure logic: tag parsing, sorting, filtering, due labels, saved-filter loading |
| `recurrence.js` | Pure logic: repeat patterns, next due date, next occurrence |
| `render.js` | DOM building (`textContent` only) |
| `tests/` | `node:test` unit tests, plus `tests/browser/` headless browser tests |
| `screenshots/` | Browser verification screenshots, per ticket |
| `style.css` | Styles, with light and dark themes |

Data lives in the `todo-app` IndexedDB database, in the `tasks` store, in the browser that opened the page.
