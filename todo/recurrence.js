// Pure recurring-task logic: allowed patterns, next due date, and the next occurrence of a completed task.
// Dates are local-time strings "YYYY-MM-DDTHH:mm" (the <input type="datetime-local"> format).
// Loaded in the browser as a classic script (global `Recurrence`), and require()d by node tests.
const Recurrence = (() => {
  const REPEATS = ['none', 'daily', 'weekly', 'monthly'];
  const LABELS = { daily: '↻ Daily', weekly: '↻ Weekly', monthly: '↻ Monthly' };
  const MAX_CATCH_UP = 1000; // stop runaway loops on absurdly old dates (threat model #3)

  // Stored and form data are untrusted: only the four known strings are accepted (threat model #2).
  const normalizeRepeat = (value) => (typeof value === 'string' && REPEATS.includes(value) ? value : 'none');

  const pad = (n) => String(n).padStart(2, '0');
  const format = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  // The date `steps` periods after `base`. Monthly keeps base's day of month, clamped to shorter months (Jan 31 -> Feb 28).
  function addPeriods(base, repeat, steps) {
    const d = new Date(base.getTime());
    if (repeat === 'daily') d.setDate(d.getDate() + steps);
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7 * steps);
    else {
      const day = base.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + steps);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, lastDay));
    }
    return d;
  }

  // Next due date after `due` that is in the future. Without a valid due date, one period from now (threat model #4).
  function nextDue(due, repeat, now = new Date()) {
    const r = normalizeRepeat(repeat);
    if (r === 'none') return null;
    const parsed = due ? new Date(due) : null;
    const nowMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
    if (!parsed || isNaN(parsed)) return format(addPeriods(nowMinute, r, 1));
    for (let steps = 1; steps <= MAX_CATCH_UP; steps++) {
      const candidate = addPeriods(parsed, r, steps);
      if (candidate > now) return format(candidate);
    }
    return format(addPeriods(nowMinute, r, 1));
  }

  // Fields for the task to create when `task` is completed, or null if none should be created.
  function nextOccurrence(task, now = new Date()) {
    const repeat = normalizeRepeat(task.repeat);
    if (!task.done || repeat === 'none' || task.spawnedNext) return null;
    return { title: task.title, due: nextDue(task.due, repeat, now), tags: [...task.tags], repeat };
  }

  const repeatLabel = (repeat) => LABELS[normalizeRepeat(repeat)] || '';

  return { REPEATS, normalizeRepeat, nextDue, nextOccurrence, repeatLabel };
})();

if (typeof module !== 'undefined') module.exports = Recurrence;
