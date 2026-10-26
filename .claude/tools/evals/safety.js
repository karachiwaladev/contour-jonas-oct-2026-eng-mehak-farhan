// Trust rules for the coverage eval, which runs a ticket's tests. The repo is public, so untrusted code must
// never run, and test processes must never see credentials.

// Which PRs' code may be checked out and executed:
// - merged into the default branch: the owner already reviewed and merged it, and it's on main anyway;
// - open: only when pushed to THIS repo (not a fork; needs write access) on a ticket-<N>- branch.
// Anything else, including an unknown origin, is refused.
function isTrustedPR(pr, n, mainBranch) {
  if (pr.state === 'MERGED') return pr.baseRefName === mainBranch;
  if (pr.state !== 'OPEN') return false;
  return pr.isCrossRepository === false && typeof pr.headRefName === 'string' && pr.headRefName.startsWith(`ticket-${n}-`);
}

const SENSITIVE = /(TOKEN|SECRET|PASSW|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIAL|_KEY$)/i;

// Copy of an environment without tokens, secrets, passwords or keys, for child processes that run test code.
function safeEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !SENSITIVE.test(k)));
}

module.exports = { isTrustedPR, safeEnv };
