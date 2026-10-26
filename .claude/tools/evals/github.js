// GitHub lookups for the coverage eval (via the gh CLI): the ticket, its PRs, posting the scorecard.
const { execFileSync } = require('child_process');

const gh = (args) => JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

// A PR belongs to ticket N if its body says Closes/Fixes/Resolves/Part of #N, or (no body reference) its title says #N.
function referencesTicket(pr, n) {
  const ref = new RegExp(`\\b(?:closes|fixes|resolves|part of)\\s+#${n}\\b`, 'i');
  if (ref.test(pr.body || '')) return true;
  if (/\b(?:closes|fixes|resolves|part of)\s+#\d+/i.test(pr.body || '')) return false; // body names another ticket
  return new RegExp(`#${n}\\b`).test(pr.title || '');
}

function getTicket(n) {
  return gh(['issue', 'view', String(n), '--json', 'number,title,state,url']);
}

function ticketPRs(n) {
  const fields = 'number,title,body,state,baseRefName,headRefName,headRefOid,mergeCommit,mergedAt,url,isCrossRepository';
  return gh(['pr', 'list', '--state', 'all', '--limit', '200', '--json', fields])
    .filter((pr) => referencesTicket(pr, n))
    .sort((a, b) => a.number - b.number);
}

function defaultBranch() {
  return gh(['repo', 'view', '--json', 'defaultBranchRef']).defaultBranchRef.name;
}

function postComment(n, bodyFile) {
  execFileSync('gh', ['issue', 'comment', String(n), '--body-file', bodyFile], { stdio: 'inherit' });
}

module.exports = { referencesTicket, getTicket, ticketPRs, defaultBranch, postComment };
