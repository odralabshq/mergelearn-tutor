import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AGENT_ADAPTERS,
  applyInstall,
  listCanonicalSkills,
  planInstall,
  readManifest,
  uninstall,
} from '../../src/core/agentSkills.js';

/** A fake canonical skills/ root with one skill, so tests never depend on the
 * real repo skills or touch a real ~/.claude. */
async function fakeSkillsRoot(body = 'canonical v1'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mlt-skills-'));
  await mkdir(join(root, 'mergelearn-authoring'), { recursive: true });
  await writeFile(join(root, 'mergelearn-authoring', 'SKILL.md'), `---\nname: mergelearn-authoring\n---\n${body}\n`, 'utf8');
  return root;
}

async function dirs() {
  return {
    lib: await mkdtemp(join(tmpdir(), 'mlt-lib-')),
    home: await mkdtemp(join(tmpdir(), 'mlt-home-')),
  };
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

describe('agentSkills installer', () => {
  it('lists canonical skills that contain a SKILL.md', async () => {
    const skillsRoot = await fakeSkillsRoot();
    expect(await listCanonicalSkills(skillsRoot)).toEqual(['mergelearn-authoring']);
  });

  it('plans an install as "installed" when nothing is present, writing nothing', async () => {
    const { lib, home } = await dirs();
    const skillsRoot = await fakeSkillsRoot();
    const plan = await planInstall(lib, { agents: ['all'], scope: 'global', home, skillsRoot });
    // one action per adapter
    expect(plan).toHaveLength(Object.keys(AGENT_ADAPTERS).length);
    expect(plan.every((a) => a.status === 'installed')).toBe(true);
    // dry: destination not created by planning
    expect(await exists(join(home, '.claude', 'skills', 'mergelearn-authoring'))).toBe(false);
    // and no manifest written
    expect((await readManifest(lib)).installs).toEqual([]);
  });

  it('installs by copying, records a manifest, and reports "current" on rerun', async () => {
    const { lib, home } = await dirs();
    const skillsRoot = await fakeSkillsRoot();
    const first = await applyInstall(lib, { agents: ['claude', 'codex'], scope: 'global', home, skillsRoot });
    expect(first.copied).toHaveLength(2);
    const claudeSkill = join(home, '.claude', 'skills', 'mergelearn-authoring', 'SKILL.md');
    expect(await exists(claudeSkill)).toBe(true);

    const manifest = await readManifest(lib);
    expect(manifest.installs).toHaveLength(2);
    expect(manifest.installs[0].sourceChecksum).toMatch(/^[0-9a-f]{64}$/);

    // Rerun: unchanged source -> both current, nothing copied again.
    const second = await applyInstall(lib, { agents: ['claude', 'codex'], scope: 'global', home, skillsRoot });
    expect(second.copied).toHaveLength(0);
    expect(second.skipped.every((a) => a.status === 'current')).toBe(true);
  });

  it('re-copies when the canonical source changes ("updated")', async () => {
    const { lib, home } = await dirs();
    const skillsRoot = await fakeSkillsRoot('canonical v1');
    await applyInstall(lib, { agents: ['claude'], scope: 'global', home, skillsRoot });
    // Change the canonical source, then rerun.
    await writeFile(join(skillsRoot, 'mergelearn-authoring', 'SKILL.md'), '---\nname: mergelearn-authoring\n---\ncanonical v2\n', 'utf8');
    const plan = await planInstall(lib, { agents: ['claude'], scope: 'global', home, skillsRoot });
    expect(plan[0].status).toBe('updated');
    const res = await applyInstall(lib, { agents: ['claude'], scope: 'global', home, skillsRoot });
    expect(res.copied).toHaveLength(1);
    const installed = await readFile(join(home, '.claude', 'skills', 'mergelearn-authoring', 'SKILL.md'), 'utf8');
    expect(installed).toContain('canonical v2');
  });

  it('never clobbers a locally modified skill', async () => {
    const { lib, home } = await dirs();
    const skillsRoot = await fakeSkillsRoot();
    await applyInstall(lib, { agents: ['claude'], scope: 'global', home, skillsRoot });
    // User edits the installed copy by hand.
    const dest = join(home, '.claude', 'skills', 'mergelearn-authoring', 'SKILL.md');
    await writeFile(dest, 'hand edited by the user\n', 'utf8');
    const plan = await planInstall(lib, { agents: ['claude'], scope: 'global', home, skillsRoot });
    expect(plan[0].status).toBe('locally_modified');
    const res = await applyInstall(lib, { agents: ['claude'], scope: 'global', home, skillsRoot });
    expect(res.copied).toHaveLength(0);
    expect(res.skipped[0].status).toBe('locally_modified');
    // The user's edit survives.
    expect(await readFile(dest, 'utf8')).toContain('hand edited by the user');
  });

  it('uninstalls only manifest-tracked files and prunes those entries', async () => {
    const { lib, home } = await dirs();
    const skillsRoot = await fakeSkillsRoot();
    await applyInstall(lib, { agents: ['claude', 'codex'], scope: 'global', home, skillsRoot });
    const removedRes = await uninstall(lib, { agents: ['claude'], scope: 'global' });
    expect(removedRes.removed).toHaveLength(1);
    // claude gone, codex remains
    expect(await exists(join(home, '.claude', 'skills', 'mergelearn-authoring'))).toBe(false);
    expect(await exists(join(home, '.codex', 'skills', 'mergelearn-authoring'))).toBe(true);
    // manifest now only tracks codex
    const manifest = await readManifest(lib);
    expect(manifest.installs.map((i) => i.agent)).toEqual(['codex']);
  });

  it('rejects an unknown agent id', async () => {
    const { lib, home } = await dirs();
    const skillsRoot = await fakeSkillsRoot();
    await expect(planInstall(lib, { agents: ['notanagent'], scope: 'global', home, skillsRoot }))
      .rejects.toThrow(/unknown agent/);
  });

  it('project scope installs into the project dir, not home', async () => {
    const { lib, home } = await dirs();
    const project = await mkdtemp(join(tmpdir(), 'mlt-proj-'));
    const skillsRoot = await fakeSkillsRoot();
    await applyInstall(lib, { agents: ['claude'], scope: 'project', home, projectDir: project, skillsRoot });
    expect(await exists(join(project, '.claude', 'skills', 'mergelearn-authoring', 'SKILL.md'))).toBe(true);
    expect(await exists(join(home, '.claude', 'skills', 'mergelearn-authoring'))).toBe(false);
  });
});
