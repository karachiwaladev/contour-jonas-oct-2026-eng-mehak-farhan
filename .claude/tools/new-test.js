// Scaffolds a new test file from the testing skill's templates. It never overwrites an existing file.
// Usage: node .claude/tools/new-test.js <project> <name> [--browser]
//   unit:    <project>/tests/<name>.test.js            (tests <project>/<name>.js)
//   browser: <project>/tests/browser/<name>.test.html  (drives <project>/index.html)
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const templates = path.join(root, '.claude', 'skills', 'testing', 'templates');
const [project, name] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const browser = process.argv.includes('--browser');

if (!project || !name || !/^[\w-]+$/.test(project) || !/^[\w.-]+$/.test(name)) {
  console.error('Usage: node .claude/tools/new-test.js <project> <name> [--browser]');
  process.exit(2);
}
if (!fs.existsSync(path.join(root, project))) {
  console.error(`No project folder "${project}/" at the repo root.`);
  process.exit(2);
}

const target = browser
  ? path.join(root, project, 'tests', 'browser', `${name}.test.html`)
  : path.join(root, project, 'tests', `${name}.test.js`);
if (fs.existsSync(target)) {
  console.error(`${path.relative(root, target)} already exists. Not overwriting.`);
  process.exit(1);
}

const template = fs.readFileSync(path.join(templates, browser ? 'browser.test.html' : 'unit.test.js'), 'utf8');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, template.split('__PROJECT__').join(project).split('__MODULE__').join(name).split('__NAME__').join(name));
console.log(`Created ${path.relative(root, target).split(path.sep).join('/')}`);

const pkg = path.join(root, project, 'package.json');
if (!browser && !fs.existsSync(pkg)) {
  console.log(`Tip: add ${project}/package.json with { "scripts": { "test": "node --test tests/" } } so CI and the gate run it via npm test.`);
}
