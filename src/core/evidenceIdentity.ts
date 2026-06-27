import { createHash } from 'node:crypto';

import type { CodeSnippet, EvidenceRef } from './types.js';

export type EvidenceIdentityInput = Pick<EvidenceRef, 'commit' | 'path' | 'label' | 'snippet'> & Partial<Pick<CodeSnippet, 'code'>>;

export function evidenceContent(input: EvidenceIdentityInput): string | undefined {
  const content = (input.snippet ?? input.code ?? '').replace(/\r\n/g, '\n').trim();
  return content.length ? content : undefined;
}

export function hasEvidenceContent(input: EvidenceIdentityInput): boolean {
  return evidenceContent(input) !== undefined;
}

export function deriveEvidenceKey(input: EvidenceIdentityInput): string {
  const content = evidenceContent(input) ?? '';
  const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  const keyMaterial = JSON.stringify({
    commit: input.commit ?? '',
    path: input.path,
    label: input.label,
    snippet: contentHash,
  });
  return `evidence_${createHash('sha256').update(keyMaterial).digest('hex').slice(0, 16)}`;
}
