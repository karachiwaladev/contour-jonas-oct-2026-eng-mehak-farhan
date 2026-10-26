// Runs unit tests with Node's built-in test runner (node:test), picking a Node 18+ binary even when
// the default `node` is older.
// Usage: node .claude/tools/run-tests.js [paths...] [--coverage]
//   paths       test files or folders (default: every <project>/tests and .claude/tools/tests)
//   --coverage  print line, branch and function coverage (node --experimental-test-coverage)
// Test files: *.test.js, *.test.mjs, *.test.cjs. Exit code is the test runner's.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TEST_FILE = /\.test\.[cm]?js$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'screenshots', 'dist', 'build']);

function versionOf(exe) {
  const r = spawnSync(exe, ['--version'], { encoding: 'utf8' });
  const m = r.status === 0 && /^v(\d+)\./.exec((r.stdout || '').trim());
  return m ? Number(m[1]) : 0;
}

// Candidate Node binaries: this one, $FACTORY_NODE, then nvm installs (nvm-windows / nvm). Highest ≥ min wins.
function findNode(min = 18) {
  const candidates = [process.execPath, process.env.FACTORY_NODE];
  const nvmRoots = [
    process.env.NVM_HOME,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Author Software', 'nvm', 'installs'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'nvm'),
    process.env.HOME && path.join(process.env.HOME, '.nvm', 'versions', 'node'),
  ];
  for (const dir of nvmRoots.filter(Boolean)) {
    if (!fs.existsSync(dir)) continue;
    for (const v of fs.readdirSync(dir)) {
      candidates.push(path.join(dir, v, process.platform === 'win32' ? 'node.exe' : path.join('bin', 'node')));
    }
  }
  let best = null;
  for (const exe of [...new Set(candidates.filter(Boolean))]) {
    if (!fs.existsSync(exe)) continue;
    const major = versionOf(exe);
    if (major >= min && (!best || major > best.major)) best = { exe, major };
  }
  return best;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TEST_FILE.test(entry.name)) out.push(full);
  }
  return out;
}

// Expands paths (files or folders) into test files. With no paths, uses every <project>/tests plus .claude/tools/tests.
function findTestFiles(paths, root = process.cwd()) {
  let targets = paths;
  if (!targets.length) {
    const projects = fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !SKIP_DIRS.has(d.name))
      .map((d) => path.join(root, d.name, 'tests'));
    targets = [...projects, path.join(root, '.claude', 'tools', 'tests')].filter((p) => fs.existsSync(p));
  }
  const files = [];
  for (const t of targets) {
    if (!fs.existsSync(t)) continue;
    if (fs.statSync(t).isDirectory()) walk(t, files);
    else if (TEST_FILE.test(t)) files.push(path.resolve(t));
  }
  return [...new Set(files)].sort();
}

module.exports = { findNode, findTestFiles };

if (require.main === module) {
  const args = process.argv.slice(2);
  const coverage = args.includes('--coverage');
  const files = findTestFiles(args.filter((a) => !a.startsWith('--')));
  if (!files.length) {
    console.log('No test files found (*.test.js / *.test.mjs under <project>/tests).');
    process.exit(0);
  }
  const node = findNode(18);
  if (!node) {
    console.error('Need Node 18+ for node:test. Install it, or set FACTORY_NODE to its node executable.');
    process.exit(2);
  }
  const nodeArgs = ['--test', ...(coverage ? ['--experimental-test-coverage'] : []), ...files];
  console.log(`Running ${files.length} test file(s) with Node ${node.major} (${node.exe})\n`);
  const r = spawnSync(node.exe, nodeArgs, { stdio: 'inherit' });
  process.exit(r.status === null ? 1 : r.status);
}
