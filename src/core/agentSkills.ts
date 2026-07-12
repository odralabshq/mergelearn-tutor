/**
 * Cross-agent skill installation (docs/design/redesign-2026-07/10 §9.6-9.8).
 *
 * MergeLearn keeps ONE canonical skill source (skills/<name>/SKILL.md) and
 * copies it into each coding agent's own discovery directory. Different agents
 * look in different places; the only portable payload is the open SKILL.md
 * format, so this module solves discovery-path differences, nothing else.
 *
 * Copies (never symlinks): symlinks are fragile on Windows and break when an
 * npm install moves. A checksum manifest makes reruns idempotent and refuses to
 * clobber a locally edited skill. Everything here takes injectable roots so it
 * is testable against temp dirs and never touches a real ~/.claude in tests.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir, cp, rm, mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Supported agents and where each discovers skills. Paths are relative to the
 * home dir (global scope) or the project root (project scope). Resolve against
 * each vendor's current docs when they change; these are the 2026 locations. */
export interface AgentAdapter {
  id: string;
  label: string;
  globalDir: (home: string) => string;
  projectDir: (project: string) => string;
}

export const AGENT_ADAPTERS: Record<string, AgentAdapter> = {
  claude: {
    id: 'claude', label: 'Claude Code',
    globalDir: (h) => join(h, '.claude', 'skills'),
    projectDir: (p) => join(p, '.claude', 'skills'),
  },
  codex: {
    id: 'codex', label: 'Codex',
    globalDir: (h) => join(h, '.codex', 'skills'),
    projectDir: (p) => join(p, '.agents', 'skills'),
  },
  cursor: {
    id: 'cursor', label: 'Cursor',
    globalDir: (h) => join(h, '.cursor', 'skills'),
    projectDir: (p) => join(p, '.cursor', 'skills'),
  },
  opencode: {
    id: 'opencode', label: 'OpenCode',
    globalDir: (h) => join(h, '.config', 'opencode', 'skills'),
    projectDir: (p) => join(p, '.opencode', 'skills'),
  },
  gemini: {
    id: 'gemini', label: 'Gemini CLI',
    globalDir: (h) => join(h, '.gemini', 'skills'),
    projectDir: (p) => join(p, '.gemini', 'skills'),
  },
};

export type Scope = 'global' | 'project';

/** Detect which agents look installed for a scope: their discovery dir (or its
 * parent config dir) already exists. Best-effort — used to pick sensible
 * defaults and to report in the summary; never required for an explicit install. */
export async function detectAgents(scope: Scope, home = homedir(), project = process.cwd()): Promise<string[]> {
  const found: string[] = [];
  for (const a of Object.values(AGENT_ADAPTERS)) {
    const dir = scope === 'global' ? a.globalDir(home) : a.projectDir(project);
    // Consider the agent present if the skills dir OR its parent (e.g. ~/.claude) exists.
    for (const candidate of [dir, dirname(dir)]) {
      try { if ((await stat(candidate)).isDirectory()) { found.push(a.id); break; } } catch { /* keep checking */ }
    }
  }
  return found;
}

/** Locate the canonical skills/ dir. Works in dev (src/core), built (dist/core),
 * and packaged (node_modules/<pkg>/dist/core) layouts by walking up from this
 * module until a skills/ directory is found. Overridable for tests. */
export async function resolveSkillsRoot(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'skills');
    try {
      if ((await stat(candidate)).isDirectory()) return candidate;
    } catch { /* keep walking up */ }
    dir = dirname(dir);
  }
  throw new Error('could not locate canonical skills/ directory');
}

/** Canonical skill names = subdirs of skills/ that contain a SKILL.md. */
export async function listCanonicalSkills(skillsRoot: string): Promise<string[]> {
  const out: string[] = [];
  let entries: string[] = [];
  try { entries = await readdir(skillsRoot); } catch { return out; }
  for (const name of entries) {
    try {
      if ((await stat(join(skillsRoot, name, 'SKILL.md'))).isFile()) out.push(name);
    } catch { /* not a skill dir */ }
  }
  return out.sort();
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** sha256 of a skill's SKILL.md, the idempotency signal. */
export async function skillChecksum(skillsRoot: string, skill: string): Promise<string> {
  return sha256(await readFile(join(skillsRoot, skill, 'SKILL.md'), 'utf8'));
}

// ---- Manifest ----

export interface SkillInstall {
  agent: string;
  scope: Scope;
  skill: string;
  destPath: string;      // the installed <dir>/<skill>/ directory
  sourceChecksum: string;
  installedAt: string;
}

export interface SkillInstallManifest {
  version: 1;
  installs: SkillInstall[];
}

const EMPTY_MANIFEST: SkillInstallManifest = { version: 1, installs: [] };

export function manifestPath(libraryRoot: string): string {
  return join(libraryRoot, 'agent-skills.json');
}

export async function readManifest(libraryRoot: string): Promise<SkillInstallManifest> {
  try {
    const raw = await readFile(manifestPath(libraryRoot), 'utf8');
    const parsed = JSON.parse(raw) as SkillInstallManifest;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.installs)) return parsed;
  } catch { /* absent or malformed -> empty */ }
  return { ...EMPTY_MANIFEST, installs: [] };
}

async function writeManifest(libraryRoot: string, m: SkillInstallManifest): Promise<void> {
  await mkdir(libraryRoot, { recursive: true });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(manifestPath(libraryRoot), `${JSON.stringify(m, null, 2)}\n`, 'utf8');
}

// ---- Plan / apply ----

/** What one (agent, scope, skill) target resolves to, and its state vs source. */
export type InstallStatus =
  | 'installed'         // not present, will be created
  | 'current'           // present and matches current source checksum
  | 'updated'           // present, previously installed by us, source changed
  | 'locally_modified'; // present but matches neither prior install nor source

export interface InstallAction {
  agent: string;
  scope: Scope;
  skill: string;
  destDir: string;      // <agentDir>/<skill>
  sourceChecksum: string;
  status: InstallStatus;
}

export interface AgentSkillOptions {
  agents: string[];             // adapter ids; 'all' expands to every adapter
  scope: Scope;
  skills?: string[];            // default: all canonical skills
  home?: string;                // injectable ~ (tests)
  projectDir?: string;          // injectable project root (tests / scope=project)
  skillsRoot?: string;          // injectable canonical source (tests)
}

function resolveAgents(ids: string[]): AgentAdapter[] {
  if (ids.includes('all')) return Object.values(AGENT_ADAPTERS);
  const out: AgentAdapter[] = [];
  for (const id of ids) {
    const a = AGENT_ADAPTERS[id];
    if (!a) throw new Error(`unknown agent "${id}" (known: ${Object.keys(AGENT_ADAPTERS).join(', ')}, all)`);
    out.push(a);
  }
  return out;
}

function agentDir(a: AgentAdapter, scope: Scope, home: string, project: string): string {
  return scope === 'global' ? a.globalDir(home) : a.projectDir(project);
}

/** Compute the planned actions without touching disk (backs --dry-run and the
 * real apply). Reads the manifest + existing dest checksums to classify each. */
export async function planInstall(
  libraryRoot: string,
  opts: AgentSkillOptions,
): Promise<InstallAction[]> {
  const home = opts.home ?? homedir();
  const project = opts.projectDir ?? process.cwd();
  const skillsRoot = await resolveSkillsRoot(opts.skillsRoot);
  const skills = opts.skills?.length ? opts.skills : await listCanonicalSkills(skillsRoot);
  const manifest = await readManifest(libraryRoot);
  const actions: InstallAction[] = [];
  for (const a of resolveAgents(opts.agents)) {
    for (const skill of skills) {
      const sourceChecksum = await skillChecksum(skillsRoot, skill);
      const destDir = join(agentDir(a, opts.scope, home, project), skill);
      const destFile = join(destDir, 'SKILL.md');
      let existing: string | undefined;
      try { existing = sha256(await readFile(destFile, 'utf8')); } catch { /* absent */ }
      const prior = manifest.installs.find(
        (i) => i.agent === a.id && i.scope === opts.scope && i.skill === skill,
      );
      let status: InstallStatus;
      if (existing === undefined) status = 'installed';
      else if (existing === sourceChecksum) status = 'current';
      else if (prior && existing === prior.sourceChecksum) status = 'updated';
      else status = 'locally_modified';
      actions.push({ agent: a.id, scope: opts.scope, skill, destDir, sourceChecksum, status });
    }
  }
  return actions;
}

export interface ApplyResult {
  actions: InstallAction[];
  copied: InstallAction[];
  skipped: InstallAction[]; // locally_modified (never clobbered) or current
}

/** Copy skills into agent dirs. Never overwrites a locally_modified target.
 * `force` re-copies `current` targets too (default skips them). Updates the
 * manifest for every target actually written. */
export async function applyInstall(
  libraryRoot: string,
  opts: AgentSkillOptions & { force?: boolean },
): Promise<ApplyResult> {
  const skillsRoot = await resolveSkillsRoot(opts.skillsRoot);
  const actions = await planInstall(libraryRoot, opts);
  const manifest = await readManifest(libraryRoot);
  const copied: InstallAction[] = [];
  const skipped: InstallAction[] = [];
  for (const act of actions) {
    if (act.status === 'locally_modified') { skipped.push(act); continue; }
    if (act.status === 'current' && !opts.force) { skipped.push(act); continue; }
    const srcDir = join(skillsRoot, act.skill);
    await mkdir(dirname(act.destDir), { recursive: true });
    await rm(act.destDir, { recursive: true, force: true });
    await cp(srcDir, act.destDir, { recursive: true });
    const idx = manifest.installs.findIndex(
      (i) => i.agent === act.agent && i.scope === act.scope && i.skill === act.skill,
    );
    const record: SkillInstall = {
      agent: act.agent, scope: act.scope, skill: act.skill,
      destPath: act.destDir, sourceChecksum: act.sourceChecksum,
      installedAt: new Date().toISOString(),
    };
    if (idx >= 0) manifest.installs[idx] = record; else manifest.installs.push(record);
    copied.push(act);
  }
  await writeManifest(libraryRoot, manifest);
  return { actions, copied, skipped };
}

export interface UninstallResult {
  removed: SkillInstall[];
  missing: SkillInstall[]; // recorded but already gone from disk
}

/** Remove ONLY files recorded in the manifest for the selected agents/scope,
 * then prune those entries. Never touches a skill dir we didn't install. */
export async function uninstall(
  libraryRoot: string,
  opts: { agents: string[]; scope?: Scope },
): Promise<UninstallResult> {
  const manifest = await readManifest(libraryRoot);
  const wantAll = opts.agents.includes('all');
  const agentIds = wantAll ? Object.keys(AGENT_ADAPTERS) : opts.agents;
  const removed: SkillInstall[] = [];
  const missing: SkillInstall[] = [];
  const keep: SkillInstall[] = [];
  for (const inst of manifest.installs) {
    const match = agentIds.includes(inst.agent) && (!opts.scope || inst.scope === opts.scope);
    if (!match) { keep.push(inst); continue; }
    try {
      await stat(inst.destPath);
      await rm(inst.destPath, { recursive: true, force: true });
      removed.push(inst);
    } catch {
      missing.push(inst);
    }
  }
  manifest.installs = keep;
  await writeManifest(libraryRoot, manifest);
  return { removed, missing };
}
