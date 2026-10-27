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

// personas.yml is the shoal-format panel (id, emoji, name, patience_steps, profile) plus the
// metrics each persona is scored on. Parsed with a small line reader: no YAML dependency.
function readPanel() {
  const text = fs.readFileSync(path.join(skillDir, 'personas.yml'), 'utf8');
  const entries = [];
  let current = null;
  let metric = null;
  for (const line of text.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^ {2}- id: (\S+)/))) entries.push((current = { id: m[1], metrics: [] }));
    else if (current && (m = line.match(/^ {6}- id: (\S+)/))) current.metrics.push((metric = { id: m[1] }));
    else if (metric && (m = line.match(/^ {8}(target|measure): (.+)/))) metric[m[1]] = m[2];
    else if (current && (m = line.match(/^ {4}(emoji|name|patience_steps|profile|modality): ?(.*)/))) current[m[1]] = m[2];
  }
  return entries;
}

test('personas.yml lists the same panel as the persona files, in shoal format', () => {
  const panel = readPanel();
  assert.deepEqual(panel.map((p) => p.id).sort(), [...EXPECTED].sort());
  for (const p of panel) {
    const fm = frontmatter(fs.readFileSync(path.join(personaDir, `${p.id}.md`), 'utf8'));
    assert.ok(p.emoji && p.name && p.profile !== undefined, `${p.id}: emoji, name, profile`);
    assert.equal(p.patience_steps, fm.patience_steps, `${p.id}: patience_steps matches its .md`);
  }
});

test('every persona is scored on at least two metrics, each with a target and a measure', () => {
  for (const p of readPanel()) {
    assert.ok(p.metrics.length >= 2, `${p.id}: at least two metrics`);
    for (const m of p.metrics) assert.ok(m.target && m.measure, `${p.id}.${m.id}: target and measure`);
  }
});

test('the skill lists every persona and runs each in an isolated page', () => {
  const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\r?\nname: persona-test\r?\n/);
  for (const id of EXPECTED) assert.ok(skill.includes(id), `SKILL.md lists ${id}`);
  assert.match(skill, /isolatedContext/);
  assert.match(skill, /pageId/);
});
