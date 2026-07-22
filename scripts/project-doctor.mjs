import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const requiredFiles = [
  'AGENTS.md',
  'CONTRIBUTING.md',
  'docs/README.md',
  'docs/PROJECT-STATE.md',
  'docs/07-sdd-workflow-and-gates.md',
  'docs/specs/M1.0-transcript-selected-cut-spec.md',
];

function git(arguments_) {
  return execFileSync('git', ['-C', root, ...arguments_], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function check(label, passed, detail) {
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${label}: ${detail}\n`);
  return passed;
}

const expectedNode = packageJson.engines.node.replace('.x', '');
const expectedPnpm = packageJson.engines.pnpm.replace('.x', '');
const userAgent = process.env.npm_config_user_agent ?? '';
const pnpmMatch = /pnpm\/([^\s]+)/u.exec(userAgent);
const nodePassed = process.versions.node.startsWith(`${expectedNode}.`);
const pnpmPassed = pnpmMatch?.[1]?.startsWith(`${expectedPnpm}.`) ?? false;
const missingFiles = requiredFiles.filter((path) => !existsSync(resolve(root, path)));

let branch = 'unavailable';
let head = 'unavailable';
let changedCount = -1;
let privateInputsIgnored = false;
try {
  branch = git(['branch', '--show-current']) || '(detached)';
  head = git(['rev-parse', '--short=12', 'HEAD']);
  const porcelain = git(['status', '--porcelain', '--untracked-files=normal']);
  changedCount = porcelain.length === 0 ? 0 : porcelain.split('\n').length;
  execFileSync('git', ['-C', root, 'check-ignore', '-q', 'videos-teste'], {
    stdio: 'ignore',
  });
  privateInputsIgnored = true;
} catch {
  // Individual checks below report unavailable Git evidence without exposing paths.
}

const results = [
  check('Node.js', nodePassed, `${process.versions.node}; expected ${packageJson.engines.node}`),
  check(
    'pnpm',
    pnpmPassed,
    `${pnpmMatch?.[1] ?? 'not invoked through pnpm'}; expected ${packageJson.engines.pnpm}`,
  ),
  check(
    'continuity documents',
    missingFiles.length === 0,
    missingFiles.length === 0 ? 'all required files present' : `${missingFiles.length} missing`,
  ),
  check('private-input ignore boundary', privateInputsIgnored, 'videos-teste is ignored by Git'),
  check('Git repository', head !== 'unavailable', `branch ${branch}; HEAD ${head}`),
];

process.stdout.write(
  `INFO worktree: ${changedCount < 0 ? 'unavailable' : `${changedCount} visible change(s)`}\n`,
);
process.stdout.write('INFO live handoff: docs/PROJECT-STATE.md\n');
process.stdout.write('INFO doctor does not inspect private inputs or execute ffprobe\n');

if (results.includes(false)) process.exitCode = 1;
