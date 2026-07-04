/**
 * Feature flags + deprecation registry (S0, doc 00 simplification).
 *
 * S0 is NON-DESTRUCTIVE. Nothing is deleted. Instead:
 *  1. A v2 flag (default OFF) gates the new LLM-sole-author pipeline. With the
 *     flag off, existing behavior is byte-for-byte unchanged, so shipping S1-S8
 *     cannot regress current users.
 *  2. A typed deprecation registry names the dead-path state collections and
 *     modules that the LLM-author redesign replaces. This is the single source
 *     of truth the eventual destructive migration (S9) will consult - it does
 *     NOT remove anything now. cardBatches is deliberately NOT deprecated: it is
 *     still needed to roll back a poisoned generation run.
 */

/** Env var that opts into the v2 LLM-author pipeline. */
export const V2_FLAG_ENV = 'MERGELEARN_V2';

export interface FlagEnv {
  [key: string]: string | undefined;
}

/**
 * Whether the v2 LLM-author pipeline is enabled. Default OFF: only "1", "true",
 * or "on" (case-insensitive) turn it on. Keeping the default off means the new
 * modules are dormant until explicitly opted in.
 */
export function isV2Enabled(env: FlagEnv = process.env): boolean {
  const raw = (env[V2_FLAG_ENV] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

/** What replaces a deprecated path once v2 is the default. */
export interface Deprecation {
  /** Kind of thing being deprecated. */
  kind: 'stateCollection' | 'module';
  /** Name of the TutorState field or module being deprecated. */
  name: string;
  /** What supersedes it under the v2 LLM-author pipeline. */
  replacedBy: string;
  /**
   * removalSafe=false means data-bearing: a destructive migration (S9) must
   * back it up / migrate it, not just drop it. true means pure dead code.
   */
  removalSafe: boolean;
}

/**
 * The single source of truth for the S0 dead-path inventory. Consumed by S9's
 * destructive migration; consulted nowhere at runtime today. Editing this list
 * is how you record a new deprecation - the migration reads it, never guesses.
 *
 * NOTE: `cardBatches` is intentionally absent. It still backs poisoned-run
 * rollback and is NOT deprecated.
 */
export const DEPRECATIONS: readonly Deprecation[] = [
  { kind: 'module', name: 'questions.ts (deterministic author)', replacedBy: 'author.ts (LLM sole author)', removalSafe: true },
  { kind: 'stateCollection', name: 'questionBank', replacedBy: 'learningItems (pendingReview staging)', removalSafe: false },
  { kind: 'stateCollection', name: 'questionDraftBatches', replacedBy: 'staging.ts decideStaging', removalSafe: false },
  { kind: 'stateCollection', name: 'studyAssignments', replacedBy: 'cardEval.ts (falsifiable eval)', removalSafe: false },
  { kind: 'stateCollection', name: 'manualRatings', replacedBy: 'grade.ts + answerKey.ts (code-as-oracle)', removalSafe: false },
];

/** Is a given TutorState collection name on the deprecated dead-path list? */
export function isDeprecatedCollection(name: string): boolean {
  return DEPRECATIONS.some((d) => d.kind === 'stateCollection' && d.name === name);
}

/** Deprecated collections that carry data (must be migrated, not dropped, in S9). */
export function dataBearingDeprecations(): Deprecation[] {
  return DEPRECATIONS.filter((d) => d.kind === 'stateCollection' && !d.removalSafe);
}
