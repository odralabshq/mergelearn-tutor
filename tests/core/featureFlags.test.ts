import { describe, expect, it } from 'vitest';

import {
  isV2Enabled, V2_FLAG_ENV, DEPRECATIONS, isDeprecatedCollection, dataBearingDeprecations,
} from '../../src/core/featureFlags.js';

describe('isV2Enabled', () => {
  it('defaults OFF when the flag is unset (existing behavior preserved)', () => {
    expect(isV2Enabled({})).toBe(false);
  });

  it('accepts 1/true/on (case-insensitive), rejects everything else', () => {
    for (const on of ['1', 'true', 'TRUE', 'on', 'On']) {
      expect(isV2Enabled({ [V2_FLAG_ENV]: on })).toBe(true);
    }
    for (const off of ['0', 'false', 'no', 'yes', '', 'enabled', ' ']) {
      expect(isV2Enabled({ [V2_FLAG_ENV]: off })).toBe(false);
    }
  });
});

describe('DEPRECATIONS registry', () => {
  it('names the deterministic author module and the dead-path collections', () => {
    const names = DEPRECATIONS.map((d) => d.name);
    expect(names.some((n) => n.includes('questions.ts'))).toBe(true);
    expect(names).toContain('questionBank');
    expect(names).toContain('questionDraftBatches');
    expect(names).toContain('studyAssignments');
    expect(names).toContain('manualRatings');
  });

  it('does NOT deprecate cardBatches (still needed for poisoned-run rollback)', () => {
    expect(isDeprecatedCollection('cardBatches')).toBe(false);
    expect(DEPRECATIONS.map((d) => d.name)).not.toContain('cardBatches');
  });

  it('marks state collections as data-bearing so S9 migrates, not drops them', () => {
    const dataBearing = dataBearingDeprecations().map((d) => d.name);
    expect(dataBearing).toContain('questionBank');
    expect(dataBearing).toContain('manualRatings');
    // The module deprecation is pure dead code, not data-bearing.
    expect(dataBearing.some((n) => n.includes('questions.ts'))).toBe(false);
  });

  it('isDeprecatedCollection recognizes a known dead-path collection', () => {
    expect(isDeprecatedCollection('questionBank')).toBe(true);
    expect(isDeprecatedCollection('learningItems')).toBe(false);
  });

  it('every deprecation records what supersedes it', () => {
    for (const d of DEPRECATIONS) {
      expect(d.replacedBy.length).toBeGreaterThan(3);
    }
  });
});
