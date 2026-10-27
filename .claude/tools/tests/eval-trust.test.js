// Ticket #28: the coverage eval runs a ticket's tests, so untrusted code must never run and the job that runs
// tests must never hold a token that can write. Checks the code paths and the workflow's job split.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { locateCode, parseArgs } = require('../evals/coverage-eval');

const open = (over) => ({ number: 30, state: 'OPEN', baseRefName: 'main', isCrossRepository: false, headRefName: 'ticket-6-x', headRefOid: 'abc', ...over });

test('locateCode: an open PR from a fork is never checked out', () => {
  assert.equal(locateCode([open({ isCrossRepository: true })], 'main', 6), null);
});

test('locateCode: an open PR on a non-ticket branch in this repo is never checked out', () => {
  assert.equal(locateCode([open({ headRefName: 'feature-x' })], 'main', 6), null);
  assert.equal(locateCode([open({ headRefName: 'ticket-60-x' })], 'main', 6), null);
});

test('parseArgs: --md writes the scorecard to a file for a separate posting job', () => {
  assert.deepEqual(parseArgs(['28', '--json', 'e.json', '--md', 'e.md']),
    { n: 28, post: false, unitOnly: false, jsonOut: 'e.json', mdOut: 'e.md' });
  assert.deepEqual(parseArgs(['7', '--post', '--unit-only']), { n: 7, post: true, unitOnly: true, jsonOut: null, mdOut: null });
});

// Minimal reader for this workflow's layout: the text of each job under `jobs:`, keyed by job id.
function jobs(yml) {
  const body = yml.split(/^jobs:\s*$/m)[1] || '';
  const out = {};
  for (const part of body.split(/^ {2}(?=[\w-]+:\s*$)/m).filter((p) => p.trim())) out[part.split(':')[0].trim()] = part;
  return out;
}

const yml = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'coverage-eval.yml'), 'utf8');
const { eval: evalJob, post } = jobs(yml);

test('workflow: no workflow-wide permissions; each job declares its own', () => {
  assert.doesNotMatch(yml.split(/^jobs:/m)[0], /^permissions:/m);
  assert.ok(evalJob && post, 'expected an "eval" job and a "post" job');
});

test('workflow: the eval job (runs ticket tests) has a read-only token and never posts', () => {
  assert.match(evalJob, /permissions:/);
  assert.doesNotMatch(evalJob, /:\s*write\b/);
  assert.doesNotMatch(evalJob, /--post\b/);
});

test('workflow: the post job can write issues but never checks out or runs ticket code', () => {
  assert.match(post, /issues:\s*write/);
  assert.match(post, /needs:\s*eval/);
  assert.doesNotMatch(post, /actions\/checkout/);
  assert.doesNotMatch(post, /\bnode\b|\bnpm\b/);
  assert.match(post, /gh issue comment/);
});
