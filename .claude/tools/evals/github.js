// GitHub lookups for the ticket evals (via the gh CLI): the ticket, its plan, its PRs and where they landed.
const { execFileSync } = require('child_process');
const { referencesTicket } = require('./qa');

const gh = (args) => JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

function getTicket(n) {
  return gh(['issue', 'view', String(n), '--json', 'number,title,state,stateReason,body,comments,url']);
}

// The latest factory plan comment (marker <!-- factory:plan -->), or null.
function latestPlan(ticket) {
  const plans = ticket.comments.filter((c) => c.body.includes('<!-- factory:plan -->'));
  return plans.length ? plans[plans.length - 1].body : null;
}

function ticketPRs(n) {
  const fields = 'number,title,body,state,baseRefName,headRefName,headRefOid,mergeCommit,mergedAt,url';
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

module.exports = { getTicket, latestPlan, ticketPRs, defaultBranch, postComment };
