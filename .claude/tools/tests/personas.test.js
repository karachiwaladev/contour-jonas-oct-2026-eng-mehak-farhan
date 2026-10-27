// The persona-test skill hands each persona file to its own subagent, so every file must carry
// the fields and sections the subagent prompt relies on, and the skill must list every persona.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const skillDir = path.join(__dirname, '..', '..', 'skills', 'persona-test');
const personaDir = path.join(skillDir, 'personas');
const EXPECTED = ['speedrun-sam', 'malicious-miranda', 'slow-akram', 'gadget-gabi', 'curious-george', 'inspector-uncle'];
const SECTIONS = ['## Who', '## Setup', '## How they behave', '## What to try', '## What to report'];

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  return Object.fromEntries(m[1].split(/\r?\n/).map((l) => l.split(/:\s*/)).map(([k, ...v]) => [k.trim(), v.join(': ').trim()]));
}

const files = fs.existsSync(personaDir) ? fs.readdirSync(personaDir).filter((f) => f.endsWith('.md')) : [];

test('the panel is exactly the six agreed personas', () => {
  assert.deepEqual(files.map((f) => f.replace(/\.md$/, '')).sort(), [...EXPECTED].sort());
});

test('each persona has frontmatter the skill relies on', () => {
  for (const f of files) {
    const fm = frontmatter(fs.readFileSync(path.join(personaDir, f), 'utf8'));
    assert.ok(fm, `${f}: frontmatter`);
    assert.equal(fm.id, f.replace(/\.md$/, ''), `${f}: id matches file name`);
    assert.ok(fm.name && fm.emoji, `${f}: name and emoji`);
    const steps = Number(fm.patience_steps);
    assert.ok(Number.isInteger(steps) && steps >= 10 && steps <= 80, `${f}: patience_steps 10-80`);
  }
});

test('each persona has every section a subagent needs', () => {
  for (const f of files) {
    const text = fs.readFileSync(path.join(personaDir, f), 'utf8');
    for (const s of SECTIONS) assert.ok(text.includes(s), `${f}: missing "${s}"`);
  }
});

test('the skill lists every persona and runs each in an isolated page', () => {
  const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\r?\nname: persona-test\r?\n/);
  for (const id of EXPECTED) assert.ok(skill.includes(id), `SKILL.md lists ${id}`);
  assert.match(skill, /isolatedContext/);
  assert.match(skill, /pageId/);
});
