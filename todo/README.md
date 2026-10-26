# Todo

A simple todo app that runs entirely in the browser. Tasks are stored in a client-side
database (IndexedDB), so they persist across reloads with no server.

## Features

- Create a task
- Mark a task done (or undo it)
- Delete a task

## Run it

Open `index.html` in a browser. No build step or dependencies are needed.
Serving the folder also works, e.g. `npx serve todo`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page markup |
| `db.js` | IndexedDB wrapper (`TaskDB.all/add/get/put/remove`) |
| `app.js` | UI logic: render, add, toggle, delete |
| `style.css` | Styles, with light and dark themes |

Data lives in the `todo-app` IndexedDB database, in the `tasks` store, in the browser that opened the page.
