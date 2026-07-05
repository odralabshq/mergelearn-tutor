/**
 * Teachability pre-filter (S4, doc 05 blind-spot fix).
 *
 * Some grounded code is still noise: vendored deps, generated output, lockfiles,
 * minified bundles. Cards from these are "grounded" but not teachable. This is a
 * cheap path-based deny-list + heuristic that skips such files BEFORE authoring.
 * The rule stays deterministic and conservative - when unsure, allow (the LLM is
 * the final judge of teachability, per doc 01).
 */

const DENY_DIR = [
  'node_modules/', 'vendor/', 'third_party/', 'dist/', 'build/', 'out/',
  '.next/', '.nuxt/', 'coverage/', '.git/', '__generated__/', 'generated/',
];

const DENY_FILE = [
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  'composer.lock', 'cargo.lock', 'poetry.lock', 'gemfile.lock',
];

const DENY_SUFFIX = [
  '.min.js', '.min.css', '.map', '.snap', '.lock',
  '.d.ts', '.pb.go', '_pb2.py', '.g.dart',
];

/** True when a path is worth teaching from. Conservative: unknown => teachable. */
export function isTeachablePath(path: string): boolean {
  const p = path.replace(/\\/g, '/').toLowerCase();
  const base = p.split('/').pop() ?? p;
  if (DENY_DIR.some((d) => p.includes(d))) return false;
  if (DENY_FILE.includes(base)) return false;
  if (DENY_SUFFIX.some((s) => base.endsWith(s))) return false;
  return true;
}

/** Filter a list of candidate paths to the teachable ones. */
export function filterTeachable(paths: string[]): string[] {
  return paths.filter(isTeachablePath);
}

/**
 * Range-content teachability (eval blind-spot fix, 2026-07-04).
 *
 * Path filtering is not enough: a cited range INSIDE a good file can still be
 * pure noise - a comment block, an import list, or lone braces. The platform
 * evaluation showed cards on such ranges score ~1.8-2.4 (vs ~4.4 for real
 * logic), and with no answer-key oracle running they ship silently. This is the
 * cheap, deterministic guard: measure the fraction of SUBSTANTIVE lines (actual
 * statements) and flag ranges that are mostly noise.
 *
 * Deliberately conservative, matching this module's contract: it only rejects
 * CLEAR structural noise (comments/imports/braces dominant). Judging whether real
 * code is pedagogically weak is the author's/oracle's job, not a regex's.
 */
export interface TeachabilityScore {
  teachable: boolean;
  /** Substantive lines / non-blank lines, in [0,1]. */
  ratio: number;
  substantive: number;
  nonBlank: number;
  reason?: string;
}

/** Below this fraction of real-code lines, a range is treated as noise. */
export const TEACHABILITY_FLOOR = 0.34;

const COMMENT_LINE = /^\s*(\/\/|#|\/\*|\*\/?|<!--|-->|--)/;
const IMPORT_LINE = /^\s*(import\b|export\s+\{[^}]*\}\s*from\b|from\s+\S+\s+import\b|require\(|using\b|#include\b|use\s+\S+;)/;
/** A line made only of brackets/braces/parens and trivial punctuation. */
const PUNCT_ONLY = /^[\s{}()\[\];,.<>]*$/;

/** True when a line carries real, teachable content (a statement, not noise). */
function isSubstantive(line: string): boolean {
  if (!line.trim()) return false;            // blank
  if (COMMENT_LINE.test(line)) return false; // full-line comment
  if (IMPORT_LINE.test(line)) return false;  // import/require/using
  if (PUNCT_ONLY.test(line)) return false;   // lone braces/brackets
  return true;
}

/**
 * Score a frozen snippet's teachability by substantive-line ratio. Empty/blank
 * snippets score 0 (verifyFormat already blocks those separately). Never throws.
 */
export function scoreSnippetTeachability(text: string): TeachabilityScore {
  const lines = text.split('\n');
  const nonBlank = lines.filter((l) => l.trim().length > 0).length;
  const substantive = lines.filter(isSubstantive).length;
  const ratio = nonBlank === 0 ? 0 : substantive / nonBlank;
  const teachable = ratio >= TEACHABILITY_FLOOR;
  return {
    teachable,
    ratio,
    substantive,
    nonBlank,
    reason: teachable ? undefined : `low signal: ${substantive}/${nonBlank} substantive lines (mostly comments, imports, or braces)`,
  };
}
