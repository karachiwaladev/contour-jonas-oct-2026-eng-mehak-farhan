// DOM building for the todo app. User content is only ever set via textContent (never innerHTML).
// Depends on the `Filters`, `Recurrence` and `Priority` globals for labels and the tag list.
const Render = (() => {
  function el(tag, props = {}) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    return node;
  }

  function checkboxFor(task) {
    const box = el('input', { type: 'checkbox', checked: task.done, id: `task-${task.id}` });
    box.dataset.action = 'toggle';
    return box;
  }

  function metaFor(task, now) {
    const info = Filters.dueInfo(task, now);
    const repeat = Recurrence.repeatLabel(task.repeat);
    const priority = Priority.normalizePriority(task.priority);
    const meta = el('div', { className: 'meta' });
    meta.append(el('span', { className: `priority priority-${priority}`, textContent: Priority.priorityLabel(priority) }));
    if (info) meta.append(el('span', { className: 'due' + (info.state ? ` ${info.state}` : ''), textContent: info.text }));
    if (repeat) meta.append(el('span', { className: 'repeat', textContent: repeat }));
    for (const tag of task.tags) meta.append(el('span', { className: 'tag', textContent: tag }));
    return meta;
  }

  function actionButton(task, action, text) {
    const btn = el('button', { type: 'button', className: action, textContent: text });
    btn.dataset.action = action;
    btn.setAttribute('aria-label', `${text} "${task.title}"`);
    return btn;
  }

  function renderTask(task, now = new Date()) {
    const li = el('li', { className: 'task' + (task.done ? ' done' : '') });
    li.dataset.id = task.id;
    const checkbox = checkboxFor(task);
    const body = el('div', { className: 'task-body' });
    body.append(el('label', { htmlFor: checkbox.id, textContent: task.title }));
    body.append(metaFor(task, now));
    li.append(checkbox, body, actionButton(task, 'edit', 'Edit'), actionButton(task, 'delete', 'Delete'));
    return li;
  }

  function tagChip(tag, selected) {
    const chip = el('button', { type: 'button', className: 'tag tag-toggle', textContent: tag });
    chip.dataset.tag = tag;
    chip.setAttribute('aria-pressed', String(selected));
    return chip;
  }

  // els: { statusButtons, priorityButtons, tagFilter, tagChips, clearTags }
  function renderFilters(els, tasks, filters) {
    for (const btn of els.priorityButtons) btn.setAttribute('aria-pressed', String(filters.priorities.includes(btn.dataset.priority)));
    const counts = { all: tasks.length, open: tasks.filter((t) => !t.done).length, done: tasks.filter((t) => t.done).length };
    for (const btn of els.statusButtons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.status === filters.status));
      btn.querySelector('.count').textContent = counts[btn.dataset.status];
    }
    const tags = Filters.allTags(tasks);
    els.tagFilter.hidden = tags.length === 0;
    els.clearTags.hidden = filters.tags.length === 0;
    els.tagChips.replaceChildren(...tags.map((tag) => tagChip(tag, filters.tags.includes(tag))));
  }

  return { renderTask, renderFilters };
})();
