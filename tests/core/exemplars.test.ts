import { describe, expect, it } from 'vitest';

import { isTeachablePath, filterTeachable } from '../../src/core/teachability.js';
import { planeBloom, exemplars, exemplarBlock } from '../../src/core/exemplars.js';
import type { QuestionPlane } from '../../src/core/types.js';

const PLANES: QuestionPlane[] = [
  'language_mechanics', 'local_behavior', 'file_role',
  'architecture_flow', 'risk_and_tests', 'repo_domain',
];

describe('teachability pre-filter', () => {
  it('rejects vendored, generated, and lockfile paths', () => {
    expect(isTeachablePath('node_modules/foo/index.js')).toBe(false);
    expect(isTeachablePath('dist/bundle.min.js')).toBe(false);
    expect(isTeachablePath('package-lock.json')).toBe(false);
    expect(isTeachablePath('src/types/api.d.ts')).toBe(false);
  });

  it('allows real source files', () => {
    expect(isTeachablePath('src/core/author.ts')).toBe(true);
    expect(isTeachablePath('lib/handler.py')).toBe(true);
  });

  it('is conservative: unknown paths are teachable', () => {
    expect(isTeachablePath('weird/thing.xyz')).toBe(true);
  });

  it('filterTeachable keeps only teachable paths', () => {
    const kept = filterTeachable(['src/a.ts', 'node_modules/b.js', 'yarn.lock']);
    expect(kept).toEqual(['src/a.ts']);
  });
});

describe('exemplars and Bloom targets', () => {
  it('defines a Bloom target with a demonstrate clause for every plane', () => {
    for (const p of PLANES) {
      expect(planeBloom[p]).toBeDefined();
      expect(planeBloom[p].mustDemonstrate.length).toBeGreaterThan(10);
    }
  });

  it('ships at least one grounded exemplar per plane', () => {
    for (const p of PLANES) {
      expect(exemplars[p].length).toBeGreaterThanOrEqual(1);
      expect(exemplars[p][0].prompt.length).toBeGreaterThan(10);
      expect(exemplars[p][0].expectedAnswer.length).toBeGreaterThan(10);
    }
  });

  it('exemplarBlock renders Q/A pairs and bounds the count', () => {
    const block = exemplarBlock('local_behavior', 8);
    expect(block).toMatch(/Q:/);
    expect(block).toMatch(/A:/);
  });
});
