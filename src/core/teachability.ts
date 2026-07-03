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
