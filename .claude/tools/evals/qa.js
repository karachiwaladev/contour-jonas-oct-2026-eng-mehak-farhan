// Parsing helpers for QA evidence: acceptance checks in a factory plan, the PR's check table, embedded screenshots.

// Numbers of the checks listed under an "Acceptance checks" heading, up to the next bold heading.
function parseAcceptanceChecks(planBody) {
  const m = /\*\*Acceptance checks[^*]*\*\*([\s\S]*?)(?:\n\s*\*\*[A-Z]|$)/i.exec(planBody || '');
  if (!m) return [];
  return [...m[1].matchAll(/^\s*(\d+)\.\s+\S/gm)].map((x) => Number(x[1]));
}

// Rows of a markdown table whose first cell starts with a number: passed (✅) and failed (❌) check numbers.
function parseChecksTable(body) {
  const passed = [], failed = [];
  for (const line of (body || '').split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const num = /^(\d+)\b/.exec(cells[1]);
    if (!num) continue;
    const rest = cells.slice(2).join(' ');
    if (rest.includes('❌')) failed.push(Number(num[1]));
    else if (rest.includes('✅')) passed.push(Number(num[1]));
  }
  return { passed, failed };
}

// Markdown images, with the repo path and commit for github.com blob links.
function findImages(markdown) {
  return [...(markdown || '').matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)].map(([, alt, url]) => {
    const blob = /github\.com\/[^/]+\/[^/]+\/blob\/([0-9a-f]+)\/([^?#]+)/.exec(url);
    return { alt, url, sha: blob ? blob[1] : null, path: blob ? decodeURIComponent(blob[2]) : null };
  });
}

// A PR belongs to ticket N if its body says Closes/Fixes/Resolves/Part of #N, or (no body reference) its title says #N.
function referencesTicket(pr, n) {
  const ref = new RegExp(`\\b(?:closes|fixes|resolves|part of)\\s+#${n}\\b`, 'i');
  if (ref.test(pr.body || '')) return true;
  if (/\b(?:closes|fixes|resolves|part of)\s+#\d+/i.test(pr.body || '')) return false; // body names another ticket
  return new RegExp(`#${n}\\b`).test(pr.title || '');
}

module.exports = { parseAcceptanceChecks, parseChecksTable, findImages, referencesTicket };
