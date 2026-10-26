// Wires the todo page together: events -> TaskDB (db.js) -> Filters / Recurrence -> Render (render.js).
const form = document.getElementById('new-task');
const input = document.getElementById('task-title');
const dueInput = document.getElementById('task-due');
const tagsInput = document.getElementById('task-tags');
const repeatInput = document.getElementById('task-repeat');
const list = document.getElementById('task-list');
const empty = document.getElementById('empty');
const status = document.getElementById('status');
const filterEls = {
  statusButtons: [...document.querySelectorAll('[data-status]')],
  tagFilter: document.getElementById('tag-filter'),
  tagChips: document.getElementById('tag-chips'),
  clearTags: document.getElementById('clear-tags'),
};

const FILTER_KEY = 'todo-filters';
const storage = Filters.safeStorage(window);
const filters = Filters.loadFilters(storage, FILTER_KEY);

function saveFilters() {
  Filters.saveFilters(storage, filters, FILTER_KEY);
}

function announce(msg) {
  status.textContent = msg;
}

// Every async handler reports failures (e.g. IndexedDB unavailable) to the user instead of rejecting silently.
const reportError = (action) => (err) => announce(`Could not ${action}: ${err.message}`);

async function refresh() {
  const tasks = await TaskDB.all();
  const kept = Filters.pruneTags(filters.tags, tasks);
  if (kept.length !== filters.tags.length) {
    filters.tags = kept;
    saveFilters();
  }
  Render.renderFilters(filterEls, tasks, filters);
  const visible = tasks.filter((t) => Filters.matchesFilters(t, filters)).sort(Filters.compareTasks);
  const now = new Date();
  list.replaceChildren(...visible.map((t) => Render.renderTask(t, now)));
  empty.hidden = visible.length > 0;
  empty.textContent = tasks.length ? 'No tasks match these filters.' : 'No tasks yet. Add one above.';
}

function setFilters(change) {
  Object.assign(filters, change);
  saveFilters();
  refresh().catch(reportError('load tasks'));
}

async function addTask(title) {
  await TaskDB.add({
    title,
    due: dueInput.value || null,
    tags: Filters.parseTags(tagsInput.value),
    repeat: Recurrence.normalizeRepeat(repeatInput.value),
  });
  form.reset(); // only once saved, so a failed save keeps what the user typed
  input.focus();
  announce(`Added "${title}"`);
  await refresh();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (title) addTask(title).catch(reportError('save the task'));
});

// Toggles run one at a time: each read-modify-write finishes before the next starts, so a fast
// tick/untick can't read a stale task and wipe spawnedNext (which would allow duplicate occurrences).
let toggleQueue = Promise.resolve();
list.addEventListener('change', (e) => {
  if (e.target.dataset.action !== 'toggle') return;
  const id = Number(e.target.closest('.task').dataset.id);
  const checked = e.target.checked; // capture now; the checkbox may change again before this runs
  toggleQueue = toggleQueue.then(() => toggleTask(id, checked)).catch(reportError('update the task'));
});

async function toggleTask(id, checked) {
  const task = await TaskDB.get(id);
  if (!task) return;
  task.done = checked;
  // Completing a recurring task creates exactly one next occurrence; spawnedNext stops re-ticks making copies.
  const next = Recurrence.nextOccurrence(task);
  if (next) {
    await TaskDB.add(next);
    task.spawnedNext = true;
  }
  await TaskDB.put(task);
  announce(`Marked "${task.title}" ${task.done ? 'done' : 'not done'}${next ? '. Next one added.' : ''}`);
  await refresh();
}

async function deleteTask(li) {
  const title = li.querySelector('label').textContent;
  await TaskDB.remove(Number(li.dataset.id));
  announce(`Deleted "${title}"`);
  await refresh();
}

list.addEventListener('click', (e) => {
  if (e.target.dataset.action === 'delete') deleteTask(e.target.closest('.task')).catch(reportError('delete the task'));
});

for (const btn of filterEls.statusButtons) {
  btn.addEventListener('click', () => setFilters({ status: btn.dataset.status }));
}

filterEls.tagChips.addEventListener('click', (e) => {
  const tag = e.target.dataset.tag;
  if (!tag) return;
  setFilters({ tags: filters.tags.includes(tag) ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag] });
});

filterEls.clearTags.addEventListener('click', () => setFilters({ tags: [] }));

refresh().catch((err) => {
  announce('Could not open the local database: ' + err.message); // kept verbatim: shown on first load
});
