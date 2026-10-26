// Pure task-priority logic: allowed levels, normalization of untrusted values, sort rank and labels.
// Loaded in the browser as a classic script (global `Priority`), and require()d by node tests.
const Priority = (() => {
  const PRIORITIES = ['high', 'medium', 'low'];
  const DEFAULT_PRIORITY = 'medium';
  const LABELS = { high: 'High', medium: 'Medium', low: 'Low' };

  // Stored and form data are untrusted: only the three known strings are accepted.
  const normalizePriority = (value) => (typeof value === 'string' && PRIORITIES.includes(value) ? value : DEFAULT_PRIORITY);

  // 0 = High, 1 = Medium, 2 = Low (lower sorts first).
  const priorityRank = (value) => PRIORITIES.indexOf(normalizePriority(value));

  const priorityLabel = (value) => LABELS[normalizePriority(value)];

  return { PRIORITIES, DEFAULT_PRIORITY, normalizePriority, priorityRank, priorityLabel };
})();

if (typeof module !== 'undefined') module.exports = Priority;
