import { describe, expect, it } from 'vitest';

import { decideManageDraft, decidePracticeDraft, manageDraftKey, practiceDraftKey } from '../../src/session/draftRecovery.js';

describe('browser draft recovery', () => {
  it('restores only a matching Practice schema and exposes stale text', () => {
    const raw = JSON.stringify({ version: 1, setId: 's', cardId: 'c', response: { interaction: 'self_response', text: 'draft' } });
    expect(practiceDraftKey('s', 'c')).toBe('mergelearn:practice-draft:v1:s:c');
    expect(decidePracticeDraft(raw, 's', 'c', 'self_response')).toEqual({ kind: 'restore', value: { interaction: 'self_response', text: 'draft' } });
    expect(decidePracticeDraft(raw, 's', 'other', 'self_response')).toEqual({ kind: 'recover', text: raw });
    expect(decidePracticeDraft(raw, 's', 'c', 'choice')).toEqual({ kind: 'recover', text: raw });
    expect(decidePracticeDraft('{bad', 's', 'c', 'self_response')).toEqual({ kind: 'recover', text: '{bad' });
  });

  it('restores Manage fields only when card identity and updatedAt match', () => {
    const raw = JSON.stringify({
      version: 1, setId: 's', cardId: 'c', updatedAt: 'v1',
      fields: { prompt: 'p', shortAnswer: 'a', explanation: 'e' },
    });
    expect(manageDraftKey('s', 'c')).toBe('mergelearn:manage-draft:v1:s:c');
    expect(decideManageDraft(raw, 's', 'c', 'v1')).toMatchObject({ kind: 'restore' });
    expect(decideManageDraft(raw, 's', 'c', 'v2')).toEqual({ kind: 'recover', text: raw });
    expect(decideManageDraft(null, 's', 'c', 'v1')).toEqual({ kind: 'none' });
  });
});