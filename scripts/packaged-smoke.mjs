import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
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
    'examples/sample-lesson.json', 'examples/interview-pattern-lesson.json',
    'skills/mergelearn-authoring/SKILL.md',
    'skills/mergelearn-tutor/SKILL.md', 'LICENSE',
  ]) {
    assert(fileNames.includes(required), `package is missing ${required}`);
  }

  for (const forbidden of ['src/libCli.ts', 'dist/cli.js', '.autoloop/state.json', 'docs/agent/CHANGELOG.md', 'docs/reserach/deep-research-report (2).md']) {
    assert(!fileNames.includes(forbidden), `package should not include ${forbidden}`);
  }

  for (const maintainedDoc of ['docs/USER_MANUAL.md', 'docs/REVIEW_SESSION.md', 'docs/PRIVACY.md']) {
    assert(fileNames.includes(maintainedDoc), `package should include ${maintainedDoc}`);
  }
  for (const retiredDoc of ['docs/CUSTOMIZATION.md', 'docs/ENRICHMENT.md', 'docs/EVALUATION.md', 'docs/LEXICON.md']) {
    assert(!fileNames.includes(retiredDoc), `package should not present retired guide ${retiredDoc}`);
  }

  const manifest = require(path.join(root, 'package.json'));
  assert(manifest.name === 'mergelearn', 'package name must be mergelearn');
  assert(manifest.version === '1.2.0', 'release version must be 1.2.0');
  assert(manifest.private !== true, 'prepared package must not be private');
  assert(manifest.license === 'Apache-2.0', 'license must be Apache-2.0');
  assert(manifest.bin?.['mergelearn'] === './dist/libCli.js', 'bin path must target built CLI');

  const tarball = path.join(tmp, entry.filename);
  const extractDir = path.join(tmp, 'extract');
  run('mkdir', ['-p', extractDir], { cwd: tmp });
  run('tar', ['-xzf', tarball, '-C', extractDir], { cwd: tmp });
  await symlink(path.join(root, 'node_modules'), path.join(extractDir, 'package', 'node_modules'), 'dir');

  const packedReadme = await readFile(path.join(extractDir, 'package/README.md'), 'utf8');
  const packedManual = await readFile(path.join(extractDir, 'package/docs/USER_MANUAL.md'), 'utf8');
  const packedReview = await readFile(path.join(extractDir, 'package/docs/REVIEW_SESSION.md'), 'utf8');
  assert(packedReadme.includes('choose **Practice**') && !packedReadme.includes('choose **Prepare**'),
    'packed README should describe the current Practice destination');
  assert(packedManual.includes('**Home**') && packedManual.includes('**Library**') && packedManual.includes('**Practice**'),
    'packed user manual should describe the three current destinations');
  assert(!packedReview.includes('.skilltrace') && packedReview.includes('Strengthen weak areas'),
    'packed review guide should describe the current local session model');

  const help = run('node', ['package/dist/libCli.js', '--help'], {
    cwd: extractDir,
  });
  assert(help.stdout.includes('mergelearn'), 'extracted CLI help did not run');

  const version = run('node', ['package/dist/libCli.js', '--version'], { cwd: extractDir });
  assert(version.stdout.trim() === manifest.version, 'extracted CLI version did not match package.json');

  const sampleHome = path.join(tmp, 'sample-home');
  const sample = run('node', ['package/dist/libCli.js', '--home', sampleHome, 'sample', '--dry-run'], { cwd: extractDir });
  assert(sample.stdout.includes('would install sample lesson'), 'packed sample dry-run did not run');

  const interviewHome = path.join(tmp, 'interview-home');
  const interview = run('node', [
    'package/dist/libCli.js', '--home', interviewHome, 'apply',
    '--file', 'examples/interview-pattern-lesson.json', '--dry-run',
  ], { cwd: extractDir });
  assert(interview.stdout.includes('would apply set "interview-pattern-example"'),
    'README interview example did not resolve from the packed CLI');

  const callerExamples = path.join(extractDir, 'examples');
  await mkdir(callerExamples, { recursive: true });
  await writeFile(path.join(callerExamples, 'interview-pattern-lesson.json'), JSON.stringify({
    version: 1,
    set: { id: 'caller-example', title: 'Caller example', tagIds: [] },
    tagPatch: { reuse: [], add: [] },
    order: ['caller-card'],
    cards: [{ localId: 'caller-card', tagRefs: [], front: { prompt: 'Caller file?' }, back: { shortAnswer: 'Yes.', explanationMarkdown: 'Caller wins.' } }],
  }));
  const caller = run('node', [
    'package/dist/libCli.js', '--home', interviewHome, 'apply',
    '--file', 'examples/interview-pattern-lesson.json', '--dry-run',
  ], { cwd: extractDir });
  assert(caller.stdout.includes('would apply set "caller-example"'),
    'caller-relative file did not take precedence over the shipped example');

  const missing = spawnSync('node', [
    'package/dist/libCli.js', '--home', interviewHome, 'apply',
    '--file', 'examples/not-shipped.json', '--dry-run',
  ], { cwd: extractDir, encoding: 'utf8', env: process.env });
  assert(missing.status !== 0 && missing.stderr.includes('ENOENT'),
    'an arbitrary missing example path should still fail with ENOENT');

  const setup = run('node', ['package/dist/libCli.js', '--home', sampleHome, 'setup-agent', '--agent', 'claude', '--scope', 'project', '--dry-run'], { cwd: extractDir });
  assert(setup.stdout.includes('dry run'), 'packed setup-agent dry-run did not run');

  run('node', ['package/dist/libCli.js', '--home', sampleHome, 'sample'], { cwd: extractDir });
  const bundlePath = path.join(tmp, 'sample.mergelearn.zip');
  const exported = run('node', ['package/dist/libCli.js', '--home', sampleHome, 'export', '--set', 'mergelearn-sample', '--output', bundlePath], { cwd: extractDir });
  assert(exported.stdout.includes('exported 4 cards'), 'packed lesson export did not run');
  const importHome = path.join(tmp, 'bundle-import-home');
  const imported = run('node', ['package/dist/libCli.js', '--home', importHome, 'import-bundle', '--file', bundlePath], { cwd: extractDir });
  assert(imported.stdout.includes('imported 4 cards'), 'packed lesson import did not run');

  const backupPath = path.join(tmp, 'profile.mergelearn-backup.zip');
  const backedUp = run('node', ['package/dist/libCli.js', '--home', sampleHome, 'backup', '--output', backupPath], { cwd: extractDir });
  assert(backedUp.stdout.includes('private unencrypted backup'), 'packed profile backup did not run');
  const restoreHome = path.join(tmp, 'restore-home');
  const restored = run('node', ['package/dist/libCli.js', '--home', restoreHome, 'restore', '--file', backupPath], { cwd: extractDir });
  assert(restored.stdout.includes('restored'), 'packed profile restore did not run');
  const restoredSets = run('node', ['package/dist/libCli.js', '--home', restoreHome, 'sets'], { cwd: extractDir });
  assert(restoredSets.stdout.includes('mergelearn-sample'), 'packed profile restore lost the sample lesson');

  if (failures.length) {
    throw new Error(`Packaged smoke failed:\n- ${failures.join('\n- ')}`);
  }

  console.log(`Packaged smoke passed: ${entry.filename}`);
  console.log(`Files checked: ${fileNames.length}`);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
