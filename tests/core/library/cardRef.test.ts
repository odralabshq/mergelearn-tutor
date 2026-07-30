import { describe, expect, it } from 'vitest';

import {
  CardRefError, formatCardRef, parseCardRef, parseTargetRef, resolveCardRef, resolveTargetRef,
} from '../../../src/core/library/cardRef.js';

describe('card references (setId/cardId)', () => {
  it('round-trips the form the UI prints and the copy button copies', () => {
    const ref = formatCardRef('auth-refactor', 'card_ab12');
    expect(ref).toBe('auth-refactor/card_ab12');
    expect(parseCardRef(ref)).toEqual({ setId: 'auth-refactor', cardId: 'card_ab12' });
  });

  it('parses a bare set id as a set target', () => {
    expect(parseTargetRef('ts-deck')).toEqual({ setId: 'ts-deck' });
  });

  it('refuses a set reference where a card is required, instead of guessing', () => {
    expect(() => parseCardRef('ts-deck')).toThrow(CardRefError);
    expect(() => parseCardRef('ts-deck')).toThrow(/needs a card/);
  });

  it('rejects extra slashes and empty segments rather than silently truncating', () => {
    for (const bad of ['a/b/c', '/card', 'set/', '', '/']) {
      expect(() => parseTargetRef(bad)).toThrow(CardRefError);
    }
  });

  it('rejects ids that storage would reject', () => {
    expect(() => parseCardRef('set/card id')).toThrow(/card id must be/);
    expect(() => parseCardRef('set$/card')).toThrow(/set id must be/);
  });

  it('still resolves the older --set/--card spelling', () => {
    expect(resolveCardRef(undefined, { set: 'ts-deck', card: 'c1' }))
      .toEqual({ setId: 'ts-deck', cardId: 'c1' });
  });

  it('prefers the positional when both spellings are supplied', () => {
    expect(resolveCardRef('new-set/new-card', { set: 'old-set', card: 'old-card' }))
      .toEqual({ setId: 'new-set', cardId: 'new-card' });
  });

  it('reports a usable message when no reference is given at all', () => {
    expect(() => resolveCardRef(undefined, {})).toThrow(/missing card reference/);
    expect(() => resolveCardRef(undefined, { set: 'only-a-set' })).toThrow(/missing card reference/);
  });

  it('lets a set-or-card command take either shape', () => {
    expect(resolveTargetRef('ts-deck')).toEqual({ setId: 'ts-deck' });
    expect(resolveTargetRef('ts-deck/c1')).toEqual({ setId: 'ts-deck', cardId: 'c1' });
    expect(resolveTargetRef(undefined, { set: 'ts-deck' })).toEqual({ setId: 'ts-deck' });
    expect(resolveTargetRef(undefined, { set: 'ts-deck', card: 'c1' }))
      .toEqual({ setId: 'ts-deck', cardId: 'c1' });
    expect(() => resolveTargetRef(undefined, {})).toThrow(/missing reference/);
  });
});
