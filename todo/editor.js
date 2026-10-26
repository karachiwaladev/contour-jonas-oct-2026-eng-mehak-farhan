// Inline task editor: replaces a task row's content with a prefilled form, and reads back validated values.
// User content is only ever set via .value / textContent (never innerHTML).
// Depends on the Filters, Recurrence and Priority globals.
const Editor = (() => {
  const MAX_TITLE = 200;

  function field(labelText, control) {
    const label = document.createElement('label');
    label.className = 'field';
    const span = document.createElement('span');
    span.textContent = labelText;
    label.append(span, control);
    return label;
  }

  function input(className, type, value) {
    const el = document.createElement('input');
    Object.assign(el, { className, type, value: value || '' });
    return el;
  }

  function select(className, options, value) {
    const el = document.createElement('select');
    el.className = className;
    for (const [v, text] of options) el.append(Object.assign(document.createElement('option'), { value: v, textContent: text }));
    el.value = value;
    return el;
  }

  function button(className, type, text) {
    const b = Object.assign(document.createElement('button'), { className, type, textContent: text });
    if (type === 'button') b.dataset.action = className;
    return b;
  }

  // Swaps the row's content for an edit form prefilled from the task.
  function open(li, task) {
    const form = document.createElement('form');
    form.className = 'edit-form';
    form.noValidate = true; // validation is ours, so the message is consistent and testable
    const title = Object.assign(input('edit-title', 'text', task.title), { maxLength: MAX_TITLE, required: true });
    title.setAttribute('aria-label', 'Title');
    const repeats = Recurrence.REPEATS.map((r) => [r, r === 'none' ? 'None' : r[0].toUpperCase() + r.slice(1)]);
    const priorities = Priority.PRIORITIES.map((p) => [p, Priority.priorityLabel(p)]);
    const error = Object.assign(document.createElement('p'), { className: 'edit-error' });
    error.setAttribute('role', 'alert');
    form.append(
      title,
      field('Due', input('edit-due', 'datetime-local', task.due)),
      field('Tags', input('edit-tags', 'text', task.tags.join(', '))),
      field('Repeat', select('edit-repeat', repeats, Recurrence.normalizeRepeat(task.repeat))),
      field('Priority', select('edit-priority', priorities, Priority.normalizePriority(task.priority))),
      button('save', 'submit', 'Save'),
      button('cancel', 'button', 'Cancel'),
      error,
    );
    li.replaceChildren(form);
    title.focus();
    return form;
  }

  // Reads the form: { values } when valid, or { error } (shown in the form) when not.
  function read(form) {
    const q = (cls) => form.querySelector(cls).value;
    const title = q('.edit-title').trim();
    if (!title) return { error: 'Title is required.' };
    if (title.length > MAX_TITLE) return { error: `Title must be at most ${MAX_TITLE} characters.` };
    return {
      values: {
        title,
        due: q('.edit-due') || null,
        tags: Filters.parseTags(q('.edit-tags')),
        repeat: Recurrence.normalizeRepeat(q('.edit-repeat')),
        priority: Priority.normalizePriority(q('.edit-priority')),
      },
    };
  }

  function showError(form, message) {
    form.querySelector('.edit-error').textContent = message;
  }

  return { open, read, showError };
})();
