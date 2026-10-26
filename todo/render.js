// DOM building for the todo app. User content is only ever set via textContent (never innerHTML).
// Depends on the `Filters` global (filters.js) for due labels and the tag list.
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
    if (!info && !task.tags.length) return null;
    const meta = el('div', { className: 'meta' });
    if (info) meta.append(el('span', { className: 'due' + (info.state ? ` ${info.state}` : ''), textContent: info.text }));
    for (const tag of task.tags) meta.append(el('span', { className: 'tag', textContent: tag }));
    return meta;
  }

  function deleteButtonFor(task) {
    const del = el('button', { type: 'button', className: 'delete', textContent: 'Delete' });
    del.dataset.action = 'delete';
    del.setAttribute('aria-label', `Delete "${task.title}"`);
    return del;
  }

  function renderTask(task, now = new Date()) {
    const li = el('li', { className: 'task' + (task.done ? ' done' : '') });
    li.dataset.id = task.id;
    const checkbox = checkboxFor(task);
    const body = el('div', { className: 'task-body' });
    body.append(el('label', { htmlFor: checkbox.id, textContent: task.title }));
    const meta = metaFor(task, now);
    if (meta) body.append(meta);
    li.append(checkbox, body, deleteButtonFor(task));
    return li;
  }

  function tagChip(tag, selected) {
    const chip = el('button', { type: 'button', className: 'tag tag-toggle', textContent: tag });
    chip.dataset.tag = tag;
    chip.setAttribute('aria-pressed', String(selected));
    return chip;
  }

  // els: { statusButtons, tagFilter, tagChips, clearTags }
  function renderFilters(els, tasks, filters) {
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
