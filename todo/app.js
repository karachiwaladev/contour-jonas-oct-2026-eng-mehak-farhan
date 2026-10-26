const form = document.getElementById('new-task');
const input = document.getElementById('task-title');
const list = document.getElementById('task-list');
const empty = document.getElementById('empty');
const status = document.getElementById('status');

function announce(msg) {
  status.textContent = msg;
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

  const label = document.createElement('label');
  label.htmlFor = checkbox.id;
  label.textContent = task.title;

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'delete';
  del.dataset.action = 'delete';
  del.textContent = 'Delete';
  del.setAttribute('aria-label', `Delete "${task.title}"`);

  li.append(checkbox, label, del);
  return li;
}

async function refresh() {
  const tasks = await TaskDB.all();
  // Open tasks first, then by creation time.
  tasks.sort((a, b) => a.done - b.done || a.createdAt - b.createdAt);
  list.replaceChildren(...tasks.map(renderTask));
  empty.hidden = tasks.length > 0;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  await TaskDB.add(title);
  input.value = '';
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

refresh().catch((err) => {
  announce('Could not open the local database: ' + err.message);
});
