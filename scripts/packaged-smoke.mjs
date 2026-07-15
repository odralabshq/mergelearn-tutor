import { mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(new URL('..', import.meta.url).pathname);
const tmp = await mkdtemp(path.join(os.tmpdir(), 'mergelearn-pack-'));
const failures = [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

try {
  run('npm', ['run', 'build']);
  const packed = run('npm', ['pack', '--json', '--pack-destination', tmp]);
  const [entry] = JSON.parse(packed.stdout);
  const fileNames = entry.files.map((file) => file.path);

  for (const required of [
    'dist/libCli.js', 'dist/index.js', 'dist/index.d.ts', 'README.md', 'package.json',
    'examples/sample-lesson.json', 'skills/mergelearn-authoring/SKILL.md',
    'skills/mergelearn-tutor/SKILL.md', 'LICENSE',
  ]) {
    assert(fileNames.includes(required), `package is missing ${required}`);
  }

  for (const forbidden of ['src/libCli.ts', 'dist/cli.js', '.autoloop/state.json', 'docs/agent/CHANGELOG.md', 'docs/reserach/deep-research-report (2).md']) {
    assert(!fileNames.includes(forbidden), `package should not include ${forbidden}`);
  }

  assert(fileNames.some((file) => file === 'docs/PRIVACY.md'), 'package should include public privacy docs');
  assert(fileNames.some((file) => file === 'docs/ENRICHMENT.md'), 'package should include public enrichment docs');

  const manifest = require(path.join(root, 'package.json'));
  assert(manifest.name === 'mergelearn', 'package name must be mergelearn');
  assert(manifest.version === '0.1.0', 'first public version must be 0.1.0');
  assert(manifest.private !== true, 'prepared package must not be private');
  assert(manifest.license === 'PolyForm-Noncommercial-1.0.0', 'license must be PolyForm-Noncommercial-1.0.0');
  assert(manifest.bin?.['mergelearn'] === './dist/libCli.js', 'bin path must target built CLI');

  const tarball = path.join(tmp, entry.filename);
  const extractDir = path.join(tmp, 'extract');
  run('mkdir', ['-p', extractDir], { cwd: tmp });
  run('tar', ['-xzf', tarball, '-C', extractDir], { cwd: tmp });
  await symlink(path.join(root, 'node_modules'), path.join(extractDir, 'package', 'node_modules'), 'dir');

  const help = run('node', ['package/dist/libCli.js', '--help'], {
    cwd: extractDir,
  });
  assert(help.stdout.includes('mergelearn'), 'extracted CLI help did not run');

  const version = run('node', ['package/dist/libCli.js', '--version'], { cwd: extractDir });
  assert(version.stdout.trim() === manifest.version, 'extracted CLI version did not match package.json');

  const sampleHome = path.join(tmp, 'sample-home');
  const sample = run('node', ['package/dist/libCli.js', '--home', sampleHome, 'sample', '--dry-run'], { cwd: extractDir });
  assert(sample.stdout.includes('would install sample lesson'), 'packed sample dry-run did not run');

  const setup = run('node', ['package/dist/libCli.js', '--home', sampleHome, 'setup-agent', '--agent', 'claude', '--scope', 'project', '--dry-run'], { cwd: extractDir });
  assert(setup.stdout.includes('dry run'), 'packed setup-agent dry-run did not run');

  if (failures.length) {
    throw new Error(`Packaged smoke failed:\n- ${failures.join('\n- ')}`);
  }

  console.log(`Packaged smoke passed: ${entry.filename}`);
  console.log(`Files checked: ${fileNames.length}`);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
