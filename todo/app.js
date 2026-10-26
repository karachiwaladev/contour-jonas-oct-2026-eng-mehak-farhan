const form = document.getElementById('new-task');
const input = document.getElementById('task-title');
const dueInput = document.getElementById('task-due');
const tagsInput = document.getElementById('task-tags');
const list = document.getElementById('task-list');
const empty = document.getElementById('empty');
const status = document.getElementById('status');
const statusButtons = [...document.querySelectorAll('[data-status]')];
const tagFilter = document.getElementById('tag-filter');
const tagChips = document.getElementById('tag-chips');
const clearTags = document.getElementById('clear-tags');

const FILTER_KEY = 'todo-filters';
// status: 'all' | 'open' | 'done'; tags: selected tags (a task matches if it has any of them).
const filters = loadFilters();

function loadFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_KEY));
    if (saved && ['all', 'open', 'done'].includes(saved.status) && Array.isArray(saved.tags)) return saved;
  } catch {}
  return { status: 'all', tags: [] };
}

function saveFilters() {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch {}
}

function announce(msg) {
  status.textContent = msg;
}

// "Work, work , Urgent" -> ["work", "urgent"]
function parseTags(text) {
  return [...new Set(text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Returns { text, state } where state is 'overdue' | 'today' | '' for styling.
function dueInfo(task, now = new Date()) {
  if (!task.due) return null;
  const due = new Date(task.due);
  if (isNaN(due)) return null;
  const time = due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = due.toLocaleDateString([], { month: 'short', day: 'numeric', year: due.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  if (task.done) return { text: `${date}, ${time}`, state: '' };
  if (due < now) return { text: `Overdue · ${date}, ${time}`, state: 'overdue' };
  if (sameDay(due, now)) return { text: `Today · ${time}`, state: 'today' };
  return { text: `${date}, ${time}`, state: '' };
}

// Open tasks by due date (soonest first, undated last), then completed tasks by creation time.
function compareTasks(a, b) {
  if (a.done !== b.done) return a.done - b.done;
  if (!a.done) {
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
    if (!!a.due !== !!b.due) return a.due ? -1 : 1;
  }
  return a.createdAt - b.createdAt;
}

function matchesFilters(task) {
  if (filters.status === 'open' && task.done) return false;
  if (filters.status === 'done' && !task.done) return false;
  if (filters.tags.length && !task.tags.some((t) => filters.tags.includes(t))) return false;
  return true;
}

function renderTask(task) {
  const li = document.createElement('li');
  li.className = 'task' + (task.done ? ' done' : '');
  li.dataset.id = task.id;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = task.done;
  checkbox.id = `task-${task.id}`;
  checkbox.dataset.action = 'toggle';

  const body = document.createElement('div');
  body.className = 'task-body';

  const label = document.createElement('label');
  label.htmlFor = checkbox.id;
  label.textContent = task.title;
  body.append(label);

  const info = dueInfo(task);
  if (info || task.tags.length) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    if (info) {
      const due = document.createElement('span');
      due.className = 'due' + (info.state ? ` ${info.state}` : '');
      due.textContent = info.text;
      meta.append(due);
    }
    for (const tag of task.tags) {
      const chip = document.createElement('span');
      chip.className = 'tag';
      chip.textContent = tag;
      meta.append(chip);
    }
    body.append(meta);
  }

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'delete';
  del.dataset.action = 'delete';
  del.textContent = 'Delete';
  del.setAttribute('aria-label', `Delete "${task.title}"`);

  li.append(checkbox, body, del);
  return li;
}

function renderFilters(tasks) {
  const counts = { all: tasks.length, open: tasks.filter((t) => !t.done).length, done: tasks.filter((t) => t.done).length };
  for (const btn of statusButtons) {
    btn.setAttribute('aria-pressed', String(btn.dataset.status === filters.status));
    btn.querySelector('.count').textContent = counts[btn.dataset.status];
  }

  const allTags = [...new Set(tasks.flatMap((t) => t.tags))].sort();
  // Drop selections for tags that no longer exist (e.g. after deleting their last task).
  const kept = filters.tags.filter((t) => allTags.includes(t));
  if (kept.length !== filters.tags.length) {
    filters.tags = kept;
    saveFilters();
  }
  tagFilter.hidden = allTags.length === 0;
  clearTags.hidden = filters.tags.length === 0;
  tagChips.replaceChildren(...allTags.map((tag) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag tag-toggle';
    chip.dataset.tag = tag;
    chip.textContent = tag;
    chip.setAttribute('aria-pressed', String(filters.tags.includes(tag)));
    return chip;
  }));
}

async function refresh() {
  const tasks = await TaskDB.all();
  renderFilters(tasks);
  const visible = tasks.filter(matchesFilters).sort(compareTasks);
  list.replaceChildren(...visible.map(renderTask));
  empty.hidden = visible.length > 0;
  empty.textContent = tasks.length ? 'No tasks match these filters.' : 'No tasks yet. Add one above.';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  await TaskDB.add({ title, due: dueInput.value || null, tags: parseTags(tagsInput.value) });
  form.reset();
  input.focus();
  announce(`Added "${title}"`);
  await refresh();
});

list.addEventListener('change', async (e) => {
  if (e.target.dataset.action !== 'toggle') return;
  const id = Number(e.target.closest('.task').dataset.id);
  const task = await TaskDB.get(id);
  if (!task) return;
  task.done = e.target.checked;
  await TaskDB.put(task);
  announce(`Marked "${task.title}" ${task.done ? 'done' : 'not done'}`);
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

for (const btn of statusButtons) {
  btn.addEventListener('click', () => {
    filters.status = btn.dataset.status;
    saveFilters();
    refresh();
  });
}

tagChips.addEventListener('click', (e) => {
  const tag = e.target.dataset.tag;
  if (!tag) return;
  filters.tags = filters.tags.includes(tag) ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag];
  saveFilters();
  refresh();
});

clearTags.addEventListener('click', () => {
  filters.tags = [];
  saveFilters();
  refresh();
});

refresh().catch((err) => {
  announce('Could not open the local database: ' + err.message);
});
