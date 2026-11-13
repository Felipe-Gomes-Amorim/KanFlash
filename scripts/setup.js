#!/usr/bin/env node
// Sets KanFlash up inside a project (this folder must live at <project>/.kanflash).
//
//   node .kanflash/scripts/setup.js [--file <name>] [--shared] [--no-hook] [--no-stop] [--build]
//
// - uses the prebuilt site in dist/ (builds it only when dist/ is missing, e.g. in a development clone)
// - hides .kanflash/ (and generated files) from the project's git via .git/info/exclude
//   (a local-only rule: nothing is pushed to the project's remote)
// - writes the AI instructions to CLAUDE.local.md (or --file, or --shared for the tracked AGENTS.md/CLAUDE.md)
// - adds Claude Code hooks: SessionStart (prints the board), UserPromptSubmit (one-line reminder), Stop (nudges if a card was left stale)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../core/board.js';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);

const project = path.dirname(ROOT);
const folder = path.basename(ROOT);
const cli = `node ${folder}/bin/kanflash.js`;
const log = (m) => console.log('• ' + m);

if (path.basename(ROOT) === 'KanFlash' && !has('--force')) {
  console.log('This copy sits in a folder named "KanFlash" (it looks like the KanFlash repository itself).');
  console.log('Run setup from the copy installed inside a project (e.g. my-project/.kanflash). Use --force to ignore this check.');
  process.exit(1);
}

// 1. build
if (!has('--no-build') && (has('--build') || !fs.existsSync(path.join(ROOT, 'dist', 'index.html')))) {
  // one command string + shell: works on Windows (npm.cmd) without Node's args-with-shell warning
  const run = (a) => spawnSync(`npm ${a.join(' ')}`, { cwd: ROOT, stdio: 'inherit', shell: true });
  log('Installing dependencies…');
  if (run(['install', '--no-audit', '--no-fund']).status !== 0) process.exit(1);
  log('Building the site…');
  if (run(['run', 'build']).status !== 0) process.exit(1);
}

// 2. hide from the project's git
const customFile = val('--file');
const shared = has('--shared');
const gitDir = path.join(project, '.git');
const excludes = [folder + '/'];

// 3. AI instructions
const template = fs.readFileSync(path.join(ROOT, 'templates', 'instructions.md'), 'utf8').replaceAll('{{CLI}}', cli);
const START = '<!-- kanflash:start -->';
const END = '<!-- kanflash:end -->';
const block = `${START}\n${template.trim()}\n${END}\n`;

function writeBlock(file) {
  const p = path.join(project, file);
  let text = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const re = new RegExp(`${START}[\\s\\S]*?${END}\\n?`);
  text = re.test(text) ? text.replace(re, block) : (text && !text.endsWith('\n') ? text + '\n' : text) + (text ? '\n' : '') + block;
  fs.writeFileSync(p, text);
  log(`Instructions written to ${file}`);
}

if (shared) {
  const existing = ['AGENTS.md', 'CLAUDE.md'].filter((f) => fs.existsSync(path.join(project, f)));
  for (const f of existing.length ? existing : ['AGENTS.md']) writeBlock(f);
  log('Heads up: AGENTS.md/CLAUDE.md are usually tracked, so the KanFlash section will be committed to the project.');
} else {
  const file = customFile || 'CLAUDE.local.md';
  writeBlock(file);
  excludes.push(file);
}

// 4. Claude Code hook (local file, not tracked)
if (!has('--no-hook')) {
  const dir = path.join(project, '.claude');
  const file = path.join(dir, 'settings.local.json');
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  settings.hooks ||= {};
  const wanted = [
    ['SessionStart', `${cli} list`],
    ['UserPromptSubmit', `${cli} hook prompt`],
    ...(has('--no-stop') ? [] : [['Stop', `${cli} hook stop`]]),
  ];
  let changed = false;
  for (const [event, command] of wanted) {
    const list = (settings.hooks[event] ||= []);
    if (!list.some((g) => g.hooks?.some((h) => h.command === command))) {
      list.push({ hooks: [{ type: 'command', command }] });
      changed = true;
    }
  }
  if (changed) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
    log('Added Claude Code hooks to .claude/settings.local.json (board on startup, reminder per message, stale-card nudge).');
  }
  excludes.push('.claude/settings.local.json');
}

// 2 (apply)
if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
  const exFile = path.join(gitDir, 'info', 'exclude');
  fs.mkdirSync(path.dirname(exFile), { recursive: true });
  let ex = fs.existsSync(exFile) ? fs.readFileSync(exFile, 'utf8') : '';
  const missing = excludes.filter((e) => !ex.split(/\r?\n/).includes(e));
  if (missing.length) {
    ex += (ex && !ex.endsWith('\n') ? '\n' : '') + '# KanFlash (local)\n' + missing.join('\n') + '\n';
    fs.writeFileSync(exFile, ex);
    log(`Hidden from git: ${missing.join(', ')} (via .git/info/exclude)`);
  }
} else {
  log(`No .git folder in ${project}. If you create the repository later, run setup again or add ${excludes.join(' ')} to .git/info/exclude.`);
}

console.log(`\nDone! Open the board with:  ${cli} serve --open`);
