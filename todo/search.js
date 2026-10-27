// Pure search logic for the todo app (ticket #30). No DOM, no storage: the query only lives in memory.
// Loaded in the browser as a classic script (global `Search`), and require()d by node tests.
const Search = (() => {
  // "  REPORT  work " -> ["report", "work"]; blank -> [] (matches everything).
  function parseQuery(text) {
    return String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
  }

  // Every word must appear in the title or one of the tags, case-insensitively. Plain substring checks, never a
  // pattern built from input. Stored tasks are untrusted: a missing title or non-array tags can't throw.
  function matchesSearch(task, words) {
    if (!words.length) return true;
    const title = String(task.title || '').toLowerCase();
    const tags = Array.isArray(task.tags) ? task.tags.filter((t) => typeof t === 'string').map((t) => t.toLowerCase()) : [];
    return words.every((w) => title.includes(w) || tags.some((t) => t.includes(w)));
  }

  return { parseQuery, matchesSearch };
})();

if (typeof module !== 'undefined') module.exports = Search;
