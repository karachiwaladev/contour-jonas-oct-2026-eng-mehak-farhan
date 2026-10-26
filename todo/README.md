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

Due date and tags are set when a task is created. Editing them later isn't supported yet.

## Run it

Open `index.html` in a browser. No build step or dependencies are needed.
Serving the folder also works, e.g. `npx serve todo`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page markup |
| `db.js` | IndexedDB wrapper (`TaskDB.all/add/get/put/remove`) |
| `app.js` | UI logic: render, add, toggle, delete, filters, sorting, due labels |
| `screenshots/` | Browser verification screenshots, per ticket |
| `style.css` | Styles, with light and dark themes |

Data lives in the `todo-app` IndexedDB database, in the `tasks` store, in the browser that opened the page.
