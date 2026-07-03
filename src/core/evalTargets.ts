/**
 * Seed eval targets (S5, doc 05 addendum).
 *
 * A small set of REAL code locations in this repo, used as the held-out eval set
 * that runEval scores the author against. Doc 05 calls for ~20-30; this ships a
 * grounded starter set covering all planes and is meant to be EXPANDED during the
 * tuning buffer. These are DATA - add targets by editing this file.
 *
 * Line ranges are approximate on purpose: readRange clamps to file bounds, and
 * the author re-fetches + freezes the cited range, so a seed target only needs to
 * point at a real, teachable region of a real file.
 */

import type { AuthorTarget } from './author.js';

export const seedEvalTargets: AuthorTarget[] = [
  { conceptId: 'tools.readRange', conceptLabel: 'readRange line clamping',
    path: 'src/core/tools.ts', startLine: 1, endLine: 40, plane: 'language_mechanics' },
  { conceptId: 'tools.grepRepo', conceptLabel: 'grepRepo ripgrep invocation',
    path: 'src/core/tools.ts', startLine: 40, endLine: 80, plane: 'local_behavior' },
  { conceptId: 'endpoint.resolve', conceptLabel: 'local-first endpoint resolution',
    path: 'src/core/endpoint.ts', startLine: 45, endLine: 75, plane: 'file_role' },
  { conceptId: 'author.freeze', conceptLabel: 'SHA-pinned snippet freezing',
    path: 'src/core/author.ts', startLine: 120, endLine: 160, plane: 'architecture_flow' },
  { conceptId: 'verify.drift', conceptLabel: 'commit-drift detection',
    path: 'src/core/verify.ts', startLine: 60, endLine: 85, plane: 'risk_and_tests' },
  { conceptId: 'answerKey.blind', conceptLabel: 'independent answer-key derivation',
    path: 'src/core/answerKey.ts', startLine: 30, endLine: 45, plane: 'repo_domain' },
];
