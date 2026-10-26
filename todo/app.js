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
const filters = Filters.loadFilters(safeStorage(), FILTER_KEY);

// localStorage can throw (blocked storage, private modes); fall back to a no-op store.
function safeStorage() {
  try { return window.localStorage; } catch { return { getItem: () => null, setItem() {} }; }
}

function saveFilters() {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch {}
}

function announce(msg) {
  status.textContent = msg;
}

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
  refresh();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  await TaskDB.add({
    title,
    due: dueInput.value || null,
    tags: Filters.parseTags(tagsInput.value),
    repeat: Recurrence.normalizeRepeat(repeatInput.value),
  });
  form.reset();
  input.focus();
  announce(`Added "${title}"`);
  await refresh();
});

list.addEventListener('change', async (e) => {
  if (e.target.dataset.action !== 'toggle') return;
  const task = await TaskDB.get(Number(e.target.closest('.task').dataset.id));
  if (!task) return;
  task.done = e.target.checked;
  // Completing a recurring task creates exactly one next occurrence; spawnedNext stops re-ticks making copies.
  const next = Recurrence.nextOccurrence(task);
  if (next) {
    await TaskDB.add(next);
    task.spawnedNext = true;
  }
  await TaskDB.put(task);
  announce(`Marked "${task.title}" ${task.done ? 'done' : 'not done'}${next ? '. Next one added.' : ''}`);
  await refresh();
});

list.addEventListener('click', async (e) => {
  if (e.target.dataset.action !== 'delete') return;
  const li = e.target.closest('.task');
  const title = li.querySelector('label').textContent;
  await TaskDB.remove(Number(li.dataset.id));
  announce(`Deleted "${title}"`);
  await refresh();
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
  announce('Could not open the local database: ' + err.message);
});
