// Wires the todo page together: events -> TaskDB (db.js) -> Filters / Search / Recurrence / Priority -> Render / Editor.
const form = document.getElementById('new-task');
const input = document.getElementById('task-title');
const dueInput = document.getElementById('task-due');
const tagsInput = document.getElementById('task-tags');
const repeatInput = document.getElementById('task-repeat');
const priorityInput = document.getElementById('task-priority');
const list = document.getElementById('task-list');
const empty = document.getElementById('empty');
const status = document.getElementById('status');
const countsFooter = document.getElementById('task-counts');
const searchInput = document.getElementById('search');
const filterEls = {
  statusButtons: [...document.querySelectorAll('[data-status]')],
  priorityButtons: [...document.querySelectorAll('[data-priority]')],
  tagFilter: document.getElementById('tag-filter'),
  tagChips: document.getElementById('tag-chips'),
  clearTags: document.getElementById('clear-tags'),
};

const FILTER_KEY = 'todo-filters';
const storage = Filters.safeStorage(window);
const filters = Filters.loadFilters(storage, FILTER_KEY);
let searchWords = []; // kept in memory only, never saved: a reload starts with an empty search

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
  Render.renderCounts(countsFooter, tasks);
  const visible = tasks.filter((t) => Filters.matchesFilters(t, filters) && Search.matchesSearch(t, searchWords))
    .sort(Filters.compareTasks);
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
    priority: Priority.normalizePriority(priorityInput.value),
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

async function editTask(li) {
  const task = await TaskDB.get(Number(li.dataset.id));
  if (!task) throw new Error('task no longer exists');
  Editor.open(li, task);
}

// Saves an edit through the same queue as toggles, so an edit and a toggle can't overwrite each other.
async function saveEdit(id, values) {
  const task = await TaskDB.get(id);
  if (!task) throw new Error('task no longer exists');
  await TaskDB.put({ ...task, ...values }); // keeps id, done, createdAt and spawnedNext
  announce(`Saved "${values.title}"`);
  await refresh();
}

list.addEventListener('click', (e) => {
  const action = e.target.dataset.action, li = e.target.closest('.task');
  if (action === 'delete') deleteTask(li).catch(reportError('delete the task'));
  if (action === 'edit') editTask(li).catch(reportError('edit the task'));
  if (action === 'cancel') refresh().catch(reportError('load tasks'));
});

list.addEventListener('submit', (e) => {
  if (!e.target.classList.contains('edit-form')) return;
  e.preventDefault();
  const { values, error } = Editor.read(e.target);
  if (error) return Editor.showError(e.target, error);
  const id = Number(e.target.closest('.task').dataset.id);
  toggleQueue = toggleQueue.then(() => saveEdit(id, values)).catch(reportError('save the task'));
});

for (const btn of filterEls.priorityButtons) {
  btn.addEventListener('click', () => {
    const p = btn.dataset.priority;
    setFilters({ priorities: filters.priorities.includes(p) ? filters.priorities.filter((x) => x !== p) : [...filters.priorities, p] });
  });
}

for (const btn of filterEls.statusButtons) {
  btn.addEventListener('click', () => setFilters({ status: btn.dataset.status }));
}

filterEls.tagChips.addEventListener('click', (e) => {
  const tag = e.target.dataset.tag;
  if (!tag) return;
  setFilters({ tags: filters.tags.includes(tag) ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag] });
});

filterEls.clearTags.addEventListener('click', () => setFilters({ tags: [] }));

function setSearch(text) {
  searchWords = Search.parseQuery(text);
  refresh().catch(reportError('load tasks'));
}

searchInput.addEventListener('input', () => setSearch(searchInput.value));
searchInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  searchInput.value = '';
  setSearch('');
});

refresh().catch((err) => {
  announce('Could not open the local database: ' + err.message); // kept verbatim: shown on first load
});
