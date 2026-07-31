import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { chmod, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import type {
  AgentSetPatch, Card, CardBack, CardFront, CardSet, CardTag, Difficulty,
  Altitude, Interaction, SourceRef,
} from './types.js';
import { loadCardsForSet } from './cardStore.js';
import { listSetIds, loadOrder, loadSet } from './setStore.js';
import { loadTags, normalizeLabel, saveTags } from './tagStore.js';
import { importAgentSet, type ImportResult } from './importAgentSet.js';
import { libraryPaths } from './libraryStore.js';
import { storageIdError } from './storageId.js';

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
const MAX_ENTRY_BYTES = 10 * 1024 * 1024;
const MAX_ENTRIES = 1_000;


export class BundleError extends Error {
  constructor(message: string) { super(message); this.name = 'BundleError'; }
}

export type LessonBundleManifest = {
  formatVersion: 1;
  kind: 'lesson';
  setId: string;
  title: string;
  createdAt: string;
  cardCount: number;
  contentChecksum: string;
};

type PortableSourceRef = Omit<SourceRef, 'repoId'>;
type BundleCard = {
  id: string;
  folderPath?: string;
  tagIds: string[];
  front: CardFront;
  back: CardBack;
  difficulty?: Difficulty;
  altitude?: Altitude;
  interaction?: Interaction;
  sourceRefs?: PortableSourceRef[];
};
type BundleSet = Pick<CardSet,
  'id' | 'title' | 'description' | 'folderPath' | 'tagIds' | 'objective' |
  'lessonKind' | 'prerequisiteTagIds' | 'estimatedMinutes' | 'defaultAltitude'>;
type BundleOrder = { version: 1; cardIds: string[]; note?: string };
type BundleTags = { version: 1; tags: CardTag[] };

export type ExportBundleOptions = { now?: Date };
export type ImportBundleOptions = { now?: Date; asCopy?: boolean; dryRun?: boolean };
export type BundleInspection = {
  manifest: LessonBundleManifest;
  entryNames: string[];
  serializedContent: string;
};

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(value, null, 2)}\n`);
}

function checksum(entries: Record<string, Uint8Array>): string {
  const hash = createHash('sha256');
  for (const name of Object.keys(entries).sort()) {
    const nameBytes = Buffer.from(name, 'utf8');
    const lengths = Buffer.allocUnsafe(8);
    lengths.writeUInt32BE(nameBytes.length, 0); lengths.writeUInt32BE(entries[name].byteLength, 4);
    hash.update(lengths); hash.update(nameBytes); hash.update(entries[name]);
  }
  return hash.digest('hex');
}

function portableSource(ref: SourceRef): PortableSourceRef {
  return {
    ...(ref.repoLabel ? { repoLabel: ref.repoLabel } : {}),
    ...(ref.originUrl ? { originUrl: ref.originUrl } : {}),
    path: isAbsolute(ref.path) ? basename(ref.path) : ref.path,
    ...(ref.startLine !== undefined ? { startLine: ref.startLine } : {}),
    ...(ref.endLine !== undefined ? { endLine: ref.endLine } : {}),
    commit: ref.commit,
    ...(ref.frozenText !== undefined ? { frozenText: ref.frozenText } : {}),
    ...(ref.status ? { status: ref.status } : {}),
  };
}

function bundleCard(card: Card): BundleCard {
  return {
    id: card.id,
    ...(card.folderPath ? { folderPath: card.folderPath } : {}),
    tagIds: card.tagIds,
    front: card.front,
    back: card.back,
    ...(card.difficulty ? { difficulty: card.difficulty } : {}),
    ...(card.altitude ? { altitude: card.altitude } : {}),
    ...(card.interaction ? { interaction: card.interaction } : {}),
    ...(card.sourceRefs?.length ? { sourceRefs: card.sourceRefs.map(portableSource) } : {}),
  };
}

async function assetEntries(dir: string, prefix = 'assets'): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {};
  let children;
  try { children = await readdir(dir, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return entries;
    throw error;
  }
  for (const child of children) {
    const disk = join(dir, child.name);
    const name = `${prefix}/${child.name}`;
    if (child.isSymbolicLink()) throw new BundleError(`lesson export refuses asset symlink: ${name}`);
    if (child.isDirectory()) Object.assign(entries, await assetEntries(disk, name));
    else if (child.isFile()) entries[name] = new Uint8Array(await readFile(disk));
    else throw new BundleError(`lesson export refuses non-regular asset: ${name}`);
  }
  return entries;
}

export async function exportLessonBundle(
  root: string, setId: string, outputPath: string, opts: ExportBundleOptions = {},
): Promise<LessonBundleManifest> {
  const set = await loadSet(root, setId);
  const order = await loadOrder(root, setId);
  if (!set || !order) throw new BundleError(`set not found: ${setId}`);
  const cards = (await loadCardsForSet(root, setId)).filter((card) => card.status !== 'archived');
  const byId = new Map(cards.map((card) => [card.id, card]));
  const ordered = order.cardIds.map((id) => byId.get(id)).filter((card): card is Card => !!card);
  for (const card of cards) if (!ordered.includes(card)) ordered.push(card);

  const usedTagIds = new Set([...set.tagIds, ...ordered.flatMap((card) => card.tagIds)]);
  const tags = (await loadTags(root)).filter((tag) => usedTagIds.has(tag.id)).map((tag) => ({
    ...tag,
    parentIds: tag.parentIds?.filter((id) => usedTagIds.has(id)),
    relatedIds: tag.relatedIds?.filter((id) => usedTagIds.has(id)),
  }));
  const portableSet: BundleSet = {
    id: set.id, title: set.title, description: set.description, folderPath: set.folderPath,
    tagIds: set.tagIds.filter((id) => usedTagIds.has(id)), objective: set.objective,
    lessonKind: set.lessonKind, prerequisiteTagIds: set.prerequisiteTagIds?.filter((id) => usedTagIds.has(id)),
    estimatedMinutes: set.estimatedMinutes, defaultAltitude: set.defaultAltitude,
  };
  const entries: Record<string, Uint8Array> = {
    'set.json': jsonBytes(portableSet),
    'order.json': jsonBytes({ version: 1, cardIds: ordered.map((card) => card.id), note: order.note } satisfies BundleOrder),
    'tags.json': jsonBytes({ version: 1, tags } satisfies BundleTags),
    ...await assetEntries(libraryPaths(root).assetsDir(setId)),
  };
  for (const card of ordered) entries[`cards/${card.id}.json`] = jsonBytes(bundleCard(card));
  const manifest: LessonBundleManifest = {
    formatVersion: 1, kind: 'lesson', setId, title: set.title,
    createdAt: (opts.now ?? new Date()).toISOString(), cardCount: ordered.length,
    contentChecksum: checksum(entries),
  };
  entries['manifest.json'] = jsonBytes(manifest);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, zipSync(entries, { level: 6 }));
  return manifest;
}

function safeEntryName(name: string): boolean {
  return !!name && !/[\0-\x1f\x7f]/.test(name) && !name.includes('\\') && !name.startsWith('/')
    && name.split('/').every((part) => part !== '..' && part !== '.');
}

async function readZipFiles(path: string): Promise<Record<string, Uint8Array>> {
  const data = new Uint8Array(await readFile(path));
  if (data.byteLength > MAX_ARCHIVE_BYTES) throw new BundleError('bundle archive is too large');
  let count = 0, expanded = 0;
  const seen = new Set<string>();
  const folded = new Set<string>();
  try {
    return unzipSync(data, { filter(info) {
      if (!safeEntryName(info.name)) throw new BundleError(`unsafe bundle entry: ${info.name}`);
      if (seen.has(info.name)) throw new BundleError(`duplicate bundle entry: ${info.name}`);
      const collisionKey = info.name.normalize('NFC').toLocaleLowerCase();
      if (folded.has(collisionKey)) throw new BundleError(`case-colliding bundle entry: ${info.name}`);
      folded.add(collisionKey);
      seen.add(info.name); count += 1; expanded += info.originalSize;
      if (count > MAX_ENTRIES) throw new BundleError('bundle contains too many entries');
      if (info.originalSize > MAX_ENTRY_BYTES || expanded > MAX_EXPANDED_BYTES) throw new BundleError('bundle expands beyond safety limits');
      if (info.originalSize > 1024 * 1024 && (!info.size || info.originalSize / info.size > 200)) throw new BundleError('bundle entry has an unsafe compression ratio');
      if (info.compression !== 0 && info.compression !== 8) throw new BundleError(`unsupported compression for ${info.name}`);
      return true;
    } });
  } catch (error) {
    if (error instanceof BundleError) throw error;
    throw new BundleError(`invalid ZIP bundle: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readBundle(path: string): Promise<{ manifest: LessonBundleManifest; files: Record<string, Uint8Array> }> {
  const files = await readZipFiles(path);
  for (const name of Object.keys(files)) {
    if (!['manifest.json', 'set.json', 'order.json', 'tags.json'].includes(name)
      && !/^cards\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}\.json$/.test(name)
      && !name.startsWith('assets/')) throw new BundleError(`unsupported bundle entry: ${name}`);
  }
  const parse = <T>(name: string): T => {
    if (!files[name]) throw new BundleError(`missing bundle entry: ${name}`);
    try { return JSON.parse(strFromU8(files[name])) as T; }
    catch { throw new BundleError(`invalid JSON in ${name}`); }
  };
  const manifest = parse<LessonBundleManifest>('manifest.json');
  if (manifest.formatVersion !== 1 || manifest.kind !== 'lesson') throw new BundleError('unsupported bundle manifest');
  if (storageIdError(manifest.setId)) throw new BundleError('invalid set id in manifest');
  const content = Object.fromEntries(Object.entries(files).filter(([name]) => name !== 'manifest.json'));
  if (checksum(content) !== manifest.contentChecksum) throw new BundleError('bundle checksum mismatch');
  return { manifest, files };
}

export async function inspectLessonBundle(path: string): Promise<BundleInspection> {
  const { manifest, files } = await readBundle(path);
  const entryNames = Object.keys(files).sort();
  const serializedContent = entryNames.filter((name) => name.endsWith('.json')).map((name) => strFromU8(files[name])).join('\n');
  return { manifest, entryNames, serializedContent };
}

function parseJson<T>(files: Record<string, Uint8Array>, name: string): T {
  try { return JSON.parse(strFromU8(files[name])) as T; }
  catch { throw new BundleError(`invalid JSON in ${name}`); }
}

function copySetId(base: string, existing: Set<string>): string {
  for (let n = 1; n < 10_000; n += 1) {
    const candidate = `${base}-copy${n === 1 ? '' : `-${n}`}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new BundleError('could not allocate copy set id');
}

export async function importLessonBundle(
  root: string, archivePath: string, opts: ImportBundleOptions = {},
): Promise<ImportResult> {
  const { manifest, files } = await readBundle(archivePath);
  const set = parseJson<BundleSet>(files, 'set.json');
  const order = parseJson<BundleOrder>(files, 'order.json');
  const tagsFile = parseJson<BundleTags>(files, 'tags.json');
  if (set.id !== manifest.setId || !Array.isArray(order.cardIds) || !Array.isArray(tagsFile.tags)) throw new BundleError('bundle metadata does not agree');
  const cardNames = Object.keys(files).filter((name) => name.startsWith('cards/') && name.endsWith('.json')).sort();
  if (cardNames.length !== manifest.cardCount) throw new BundleError('bundle card count does not match manifest');
  const cards = cardNames.map((name) => parseJson<BundleCard>(files, name));
  if (new Set(cards.map((card) => card.id)).size !== cards.length || cards.some((card) => !!storageIdError(card.id))) throw new BundleError('invalid or duplicate card id');
  if (order.cardIds.length !== cards.length || new Set(order.cardIds).size !== cards.length
    || order.cardIds.some((id) => !cards.some((card) => card.id === id))) throw new BundleError('order must contain every card exactly once');

  const existingSetIds = new Set(await listSetIds(root));
  let setId = manifest.setId;
  if (existingSetIds.has(setId)) {
    if (!opts.asCopy) throw new BundleError(`set already exists: ${setId}; use asCopy to import a copy`);
    setId = copySetId(setId, existingSetIds);
  }
  const existingTags = await loadTags(root);
  const existingByLabel = new Map(existingTags.map((tag) => [normalizeLabel(tag.label), tag.id]));
  const localTag = new Map<string, string>();
  tagsFile.tags.forEach((tag, index) => localTag.set(tag.id, existingByLabel.get(normalizeLabel(tag.label)) ?? `bundle_tag_${index}`));
  const add = tagsFile.tags.filter((tag) => !existingByLabel.has(normalizeLabel(tag.label))).map((tag) => ({
    localId: localTag.get(tag.id)!, label: tag.label, kind: tag.kind, description: tag.description, aliases: tag.aliases,
    parentIds: tag.parentIds?.map((id) => localTag.get(id)).filter((id): id is string => !!id),
    relatedIds: tag.relatedIds?.map((id) => localTag.get(id)).filter((id): id is string => !!id),
  }));
  const reuse = [...new Set([...localTag.values()].filter((id) => existingTags.some((tag) => tag.id === id)))];
  const frozenSources = new Map<string, SourceRef[]>();
  const patch: AgentSetPatch = {
    version: 1,
    set: {
      ...set, id: setId,
      tagIds: set.tagIds.map((id) => localTag.get(id)).filter((id): id is string => !!id),
      prerequisiteTagIds: set.prerequisiteTagIds?.map((id) => localTag.get(id)).filter((id): id is string => !!id),
    },
    tagPatch: { reuse, add },
    order: order.cardIds,
    orderNote: order.note,
    cards: cards.map((card) => {
      if (card.sourceRefs?.length) frozenSources.set(card.id, card.sourceRefs.map((ref) => ({ ...ref, repoId: `bundle:${setId}` })));
      return {
        localId: card.id, ...(opts.asCopy ? {} : { id: card.id }), folderPath: card.folderPath,
        tagRefs: card.tagIds.map((id) => localTag.get(id)).filter((id): id is string => !!id),
        front: card.front, back: card.back, difficulty: card.difficulty,
        altitude: card.altitude, interaction: card.interaction,
      };
    }),
  };

  const parent = dirname(resolve(root));
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(join(parent, '.mergelearn-bundle-'));
  const stageRoot = join(stage, 'home');
  try {
    if (existingTags.length) await saveTags(stageRoot, existingTags);
    const result = await importAgentSet(stageRoot, patch, {
      now: opts.now, dryRun: opts.dryRun, agentName: 'bundle-import', frozenSourceRefsByLocalId: frozenSources,
    });
    if (!result.ok || opts.dryRun) return result;
    for (const [name, bytes] of Object.entries(files)) {
      if (!name.startsWith('assets/') || name.endsWith('/')) continue;
      const destination = join(libraryPaths(stageRoot).setDir(setId), ...name.split('/'));
      await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes);
    }
    const mergedTags = await loadTags(stageRoot);
    const oldTags = await loadTags(root);
    await saveTags(root, mergedTags);
    try {
      await mkdir(libraryPaths(root).sets, { recursive: true });
      await rename(libraryPaths(stageRoot).setDir(setId), libraryPaths(root).setDir(setId));
    } catch (error) {
      await saveTags(root, oldTags); throw error;
    }
    return result;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

export type ProfileBackupManifest = {
  formatVersion: 1;
  kind: 'profile_backup';
  createdAt: string;
  entryCount: number;
  contentChecksum: string;
};

const BACKUP_ROOT_FILES = ['config.json', 'repos/registry.json'];
const BACKUP_ROOT_DIRS = ['library', 'profile'];

function allowedBackupEntry(name: string): boolean {
  return BACKUP_ROOT_FILES.includes(name)
    || BACKUP_ROOT_DIRS.some((dir) => name.startsWith(`${dir}/`));
}

async function addBackupFile(root: string, relativePath: string, entries: Record<string, Uint8Array>): Promise<void> {
  const absolute = join(root, ...relativePath.split('/'));
  let handle;
  try { handle = await open(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') throw new BundleError(`backup refuses symlink: ${relativePath}`);
    throw error;
  }
  try {
    if (!(await handle.stat()).isFile()) throw new BundleError(`backup refuses non-regular path: ${relativePath}`);
    entries[relativePath] = new Uint8Array(await handle.readFile());
  } finally { await handle.close(); }
}

async function addBackupDirectory(root: string, relativePath: string, entries: Record<string, Uint8Array>): Promise<void> {
  const absolute = resolve(root, ...relativePath.split('/'));
  let actual;
  try { actual = await realpath(absolute); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const expected = join(await realpath(dirname(absolute)), basename(absolute));
  if (actual !== expected) throw new BundleError(`backup refuses symlink: ${relativePath}`);
  for (const item of await readdir(actual, { withFileTypes: true })) {
    const child = `${relativePath}/${item.name}`;
    if (item.isSymbolicLink()) throw new BundleError(`backup refuses symlink: ${child}`);
    if (item.isDirectory()) await addBackupDirectory(root, child, entries);
    else if (item.isFile()) await addBackupFile(root, child, entries);
    else throw new BundleError(`backup refuses non-regular path: ${child}`);
  }
}

async function backupEntries(root: string): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {};
  for (const path of BACKUP_ROOT_FILES) await addBackupFile(root, path, entries);
  for (const path of BACKUP_ROOT_DIRS) await addBackupDirectory(root, path, entries);
  return entries;
}

export async function exportProfileBackup(
  root: string, outputPath: string, opts: { now?: Date } = {},
): Promise<ProfileBackupManifest> {
  const source = resolve(root), output = resolve(outputPath);
  if (output === source || output.startsWith(`${source}${sep}`)) throw new BundleError('backup output must be outside the profile root');
  const content = await backupEntries(source);
  const manifest: ProfileBackupManifest = {
    formatVersion: 1, kind: 'profile_backup', createdAt: (opts.now ?? new Date()).toISOString(),
    entryCount: Object.keys(content).length, contentChecksum: checksum(content),
  };
  const entries = { ...content, 'backup-manifest.json': jsonBytes(manifest) };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, zipSync(entries, { level: 6 }), { mode: 0o600 });
  await chmod(output, 0o600);
  return manifest;
}

async function readProfileBackup(path: string): Promise<{ manifest: ProfileBackupManifest; files: Record<string, Uint8Array> }> {
  const files = await readZipFiles(path);
  for (const name of Object.keys(files)) {
    if (name !== 'backup-manifest.json' && !allowedBackupEntry(name)) throw new BundleError(`unsupported backup entry: ${name}`);
  }
  const manifest = parseJson<ProfileBackupManifest>(files, 'backup-manifest.json');
  if (manifest.formatVersion !== 1 || manifest.kind !== 'profile_backup') throw new BundleError('unsupported backup manifest');
  const content = Object.fromEntries(Object.entries(files).filter(([name]) => name !== 'backup-manifest.json'));
  if (Object.keys(content).length !== manifest.entryCount) throw new BundleError('backup entry count does not match manifest');
  if (checksum(content) !== manifest.contentChecksum) throw new BundleError('backup checksum mismatch');
  for (const [name, bytes] of Object.entries(content)) {
    if (name.endsWith('.json')) {
      try { JSON.parse(strFromU8(bytes)); }
      catch { throw new BundleError(`invalid JSON in backup entry: ${name}`); }
    }
  }
  return { manifest, files: content };
}

export async function inspectProfileBackup(path: string): Promise<{ manifest: ProfileBackupManifest; entryNames: string[] }> {
  const { manifest, files } = await readProfileBackup(path);
  return { manifest, entryNames: Object.keys(files).sort() };
}

/** Read-only: does this profile root already hold data? Exported because the
 * CLI must warn that a successful dry run will still need --force, and a dry run
 * deliberately returns before the force check. */
export async function directoryHasEntries(path: string): Promise<boolean> {
  try { return (await readdir(path)).length > 0; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function restoreProfileBackup(
  root: string, backupPath: string, opts: { force?: boolean; dryRun?: boolean } = {},
): Promise<ProfileBackupManifest> {
  const { manifest, files } = await readProfileBackup(backupPath);
  const target = resolve(root), nonEmpty = await directoryHasEntries(target);
  // Order matters: a dry run writes NOTHING, so it must not demand --force.
  // Checking force first made the safe rehearsal impossible on exactly the
  // profiles where rehearsing matters, and pushed users straight to the
  // destructive form to find out whether their backup was even valid.
  if (opts.dryRun) return manifest;
  if (nonEmpty && !opts.force) throw new BundleError('profile root is not empty; pass force to replace it');

  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(join(parent, '.mergelearn-restore-'));
  const stagedRoot = join(stage, 'restored');
  const rollback = join(stage, 'rollback');
  try {
    await mkdir(stagedRoot, { recursive: true, mode: 0o700 });
    for (const [name, bytes] of Object.entries(files)) {
      const destination = join(stagedRoot, ...name.split('/'));
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, bytes, { mode: 0o600 });
    }
    if (nonEmpty) await rename(target, rollback);
    else await rm(target, { recursive: true, force: true });
    try {
      await rename(stagedRoot, target);
      const verified = await backupEntries(target);
      if (checksum(verified) !== manifest.contentChecksum) throw new BundleError('restored profile failed read-back verification');
    } catch (error) {
      await rm(target, { recursive: true, force: true });
      if (nonEmpty) await rename(rollback, target);
      throw error;
    }
    await rm(rollback, { recursive: true, force: true });
    return manifest;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
