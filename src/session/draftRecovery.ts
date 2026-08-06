export type DraftDecision<T> =
  | { kind: 'restore'; value: T }
  | { kind: 'recover'; text: string }
  | { kind: 'none' };

export function practiceDraftKey(setId: string, cardId: string): string {
  return `mergelearn:practice-draft:v1:${setId}:${cardId}`;
}

export function manageDraftKey(setId: string, cardId: string): string {
  return `mergelearn:manage-draft:v1:${setId}:${cardId}`;
}

export function decidePracticeDraft(
  raw: string | null,
  setId: string,
  cardId: string,
  interaction: string,
): DraftDecision<unknown> {
  if (!raw) return { kind: 'none' };
  try {
    const value = JSON.parse(raw) as { version?: unknown; setId?: unknown; cardId?: unknown; response?: unknown };
    const response = value.response as Record<string, unknown> | undefined;
    const valid = response?.interaction === interaction && (
      (interaction === 'self_response' && typeof response.text === 'string')
      || (interaction === 'choice' && Array.isArray(response.selectedOptionIds) && response.selectedOptionIds.every((id) => typeof id === 'string'))
      || (interaction === 'parsons' && Array.isArray(response.orderedBlockIds) && response.orderedBlockIds.every((id) => typeof id === 'string'))
    );
    if (value.version === 1 && value.setId === setId && value.cardId === cardId && valid) {
      return { kind: 'restore', value: value.response };
    }
  } catch { /* expose the original text below */ }
  return { kind: 'recover', text: raw };
}

export function decideManageDraft(
  raw: string | null,
  setId: string,
  cardId: string,
  updatedAt: string,
): DraftDecision<{ prompt: string; shortAnswer: string; explanation: string }> {
  if (!raw) return { kind: 'none' };
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const fields = value.fields as Record<string, unknown> | undefined;
    if (value.version === 1 && value.setId === setId && value.cardId === cardId && fields
      && typeof fields.prompt === 'string' && typeof fields.shortAnswer === 'string' && typeof fields.explanation === 'string') {
      if (value.updatedAt === updatedAt) return { kind: 'restore', value: fields as { prompt: string; shortAnswer: string; explanation: string } };
      return { kind: 'recover', text: raw };
    }
  } catch { /* expose the original text below */ }
  return { kind: 'recover', text: raw };
}