import { constants } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { detectAgents, listCanonicalSkills, planInstall, resolveSkillsRoot } from '../agentSkills.js';
import { listDir } from './io.js';
import { libraryPaths } from './libraryStore.js';
import { listSetIds } from './setStore.js';

const execFileAsync = promisify(execFile);

export type DoctorStatus = 'PASS' | 'WARN' | 'FAIL';
export type DoctorCheck = { id: string; status: DoctorStatus; message: string };
export type DoctorResult = { ok: boolean; checks: DoctorCheck[] };

async function pathWritable(path: string): Promise<boolean> {
  try { await access(path, constants.W_OK); return true; } catch { return false; }
}

/** Every JSON file the library owns. Absent files are fine (most are created
 * lazily); unparseable ones are not, so the caller can name the exact path. */
async function libraryJsonFiles(root: string): Promise<string[]> {
  const p = libraryPaths(root);
  const files = [p.tags, p.folders, p.userFile, p.statsFile];
  for (const setId of await listDir(p.sets)) {
    if (setId.startsWith('.')) continue;
    files.push(p.setFile(setId), p.orderFile(setId));
    for (const entry of await listDir(p.cardsDir(setId))) {
      if (entry.startsWith('.') || !entry.endsWith('.json')) continue;
      files.push(join(p.cardsDir(setId), entry));
    }
  }
  return files;
}

/** Read-only setup diagnosis. It never creates the library, modifies skills, or
 * performs network requests. */
export async function runDoctor(libraryRoot: string): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const major = Number(process.versions.node.split('.')[0]);
  checks.push({ id: 'node', status: major >= 20 ? 'PASS' : 'FAIL', message: `Node ${process.versions.node} (${process.execPath})${major >= 20 ? '' : '; requires >=20'}` });

  try {
    const s = await stat(libraryRoot);
    const writable = s.isDirectory() && await pathWritable(libraryRoot);
    checks.push({ id: 'library', status: writable ? 'PASS' : 'FAIL', message: `${libraryRoot}${writable ? ' is writable' : ' is not a writable directory'}` });
  } catch {
    const parent = dirname(libraryRoot);
    const writable = await pathWritable(parent);
    checks.push({ id: 'library', status: writable ? 'WARN' : 'FAIL', message: writable ? `${libraryRoot} does not exist yet; it will be created on first write` : `${libraryRoot} cannot be created (parent is not writable)` });
  }

  try {
    const skillsRoot = await resolveSkillsRoot();
    const skills = await listCanonicalSkills(skillsRoot);
    const ok = skills.includes('mergelearn-authoring') && skills.includes('mergelearn-tutor');
    checks.push({ id: 'skill-source', status: ok ? 'PASS' : 'FAIL', message: ok ? `packaged skills found: ${skills.join(', ')}` : `required packaged skills missing under ${skillsRoot}` });
  } catch (e) {
    checks.push({ id: 'skill-source', status: 'FAIL', message: (e as Error).message });
  }

  const agents = await detectAgents('global');
  if (agents.length === 0) {
    checks.push({ id: 'agents', status: 'WARN', message: 'no supported global coding-agent directories detected; run setup-agent --agent <id>' });
  } else {
    const plan = await planInstall(libraryRoot, { agents, scope: 'global' });
    const stale = plan.filter((x) => x.status !== 'current');
    checks.push({ id: 'agents', status: stale.length ? 'WARN' : 'PASS', message: stale.length ? `${agents.join(', ')} detected; ${stale.length} skill copy/copies need setup-agent` : `${agents.join(', ')} detected; managed skills are current` });
  }

  try {
    const { stdout } = await execFileAsync('git', ['--version']);
    checks.push({ id: 'git', status: 'PASS', message: stdout.trim() });
  } catch {
    checks.push({ id: 'git', status: 'WARN', message: 'Git not found; conceptual lessons work, repository-grounded lessons do not' });
  }

  const setIds = await listSetIds(libraryRoot);
  checks.push({ id: 'lessons', status: setIds.length ? 'PASS' : 'WARN', message: setIds.length ? `${setIds.length} lesson(s) found` : 'no lessons yet; ask your agent or run mergelearn sample' });

  // Damaged data used to be invisible here: doctor reported ok while `list
  // cards` failed with a bare parser message naming no file. Parse every file
  // and collect ALL failures, so one bad card does not hide a second.
  const damaged: string[] = [];
  for (const file of await libraryJsonFiles(libraryRoot)) {
    try {
      JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      damaged.push(file);
    }
  }
  checks.push({
    id: 'library-data',
    status: damaged.length ? 'FAIL' : 'PASS',
    message: damaged.length
      ? `${damaged.length} unreadable file(s); restore from a backup or remove them:\n    ${damaged.join('\n    ')}`
      : 'all library and profile JSON files parse',
  });

  return { ok: checks.every((c) => c.status !== 'FAIL'), checks };
}
