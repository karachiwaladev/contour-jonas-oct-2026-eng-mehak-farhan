// Pure filter, sort and label logic for the todo app. No DOM, no storage side effects.
// Loaded in the browser as a classic script (global `Filters`), and require()d by node tests.
const Filters = (() => {
  const STATUSES = ['all', 'open', 'done'];
  const DEFAULT_FILTERS = { status: 'all', tags: [] };

  // "Work, work , Urgent" -> ["work", "urgent"]
  function parseTags(text) {
    return [...new Set(text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // Returns { text, state } where state is 'overdue' | 'today' | '' for styling, or null with no valid due date.
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

  // filters: { status: 'all' | 'open' | 'done', tags: string[] }. A task matches the tag filter if it has ANY selected tag.
  function matchesFilters(task, filters) {
    if (filters.status === 'open' && task.done) return false;
    if (filters.status === 'done' && !task.done) return false;
    if (filters.tags.length && !task.tags.some((t) => filters.tags.includes(t))) return false;
    return true;
  }

  const allTags = (tasks) => [...new Set(tasks.flatMap((t) => t.tags))].sort();

  // Drops selections for tags no task uses any more (e.g. after deleting their last task).
  function pruneTags(selected, tasks) {
    const inUse = allTags(tasks);
    return selected.filter((t) => inUse.includes(t));
  }

  // Reads saved filters from a Storage-like object; stored data is untrusted, so anything odd falls back to defaults.
  function loadFilters(storage, key = 'todo-filters') {
    try {
      const saved = JSON.parse(storage.getItem(key));
      if (saved && STATUSES.includes(saved.status) && Array.isArray(saved.tags)) {
        return { status: saved.status, tags: saved.tags.filter((t) => typeof t === 'string') };
      }
    } catch {}
    return { ...DEFAULT_FILTERS, tags: [] };
  }

  // localStorage can throw on access (blocked storage, some private modes); fall back to a no-op store.
  function safeStorage(win) {
    try { return win.localStorage; } catch { return { getItem: () => null, setItem() {} }; }
  }

  // Saves filters; returns false instead of throwing when storage is full or blocked.
  function saveFilters(storage, filters, key = 'todo-filters') {
    try {
      storage.setItem(key, JSON.stringify(filters));
      return true;
    } catch {
      return false;
    }
  }

  return { parseTags, dueInfo, compareTasks, matchesFilters, allTags, pruneTags, loadFilters, safeStorage, saveFilters };
})();

if (typeof module !== 'undefined') module.exports = Filters;
