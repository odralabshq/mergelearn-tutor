import type { AgentSetPatch, Interaction } from './types.js';
import type { ImportCardResult } from './importAgentSet.js';

export type LessonWarning = { code: string; message: string; cardLocalId?: string };
export type LessonSummary = {
  title: string;
  objective?: string;
  estimatedMinutes?: number;
  cardCount: number;
  interactionCounts: Partial<Record<Interaction['type'], number>>;
  citedCardCount: number;
  unresolvedSourceCount: number;
  warnings: LessonWarning[];
};

/** Pure, advisory summary. It never rejects or changes card status. */
export function summarizeLesson(patch: AgentSetPatch, results: ImportCardResult[] = []): LessonSummary {
  const counts: Partial<Record<Interaction['type'], number>> = {};
  let cited = 0;
  const warnings: LessonWarning[] = [];

  for (const card of patch.cards) {
    const type = card.interaction?.type ?? 'flashcard';
    counts[type] = (counts[type] ?? 0) + 1;
    if ((card.sourceRefs?.length ?? 0) > 0) cited++;
    if (card.interaction?.type === 'parsons') {
      const n = card.interaction.blocks.length;
      if (n < 3 || n > 8) warnings.push({ code: 'parsons:block_count', message: `Parsons activity has ${n} blocks; 3 to 8 is recommended`, cardLocalId: card.localId });
    }
  }

  if (!patch.set.objective) warnings.push({ code: 'lesson:no_objective', message: 'Lesson has no objective' });
  if (!patch.set.estimatedMinutes) warnings.push({ code: 'lesson:no_estimate', message: 'Lesson has no estimated duration' });
  if (Object.keys(counts).length === 1 && patch.cards.length > 1) {
    warnings.push({ code: 'lesson:single_interaction', message: `All ${patch.cards.length} activities use ${Object.keys(counts)[0]}` });
  }
  if (patch.set.lessonKind === 'repository' && cited === 0) {
    warnings.push({ code: 'lesson:no_citations', message: 'Repository lesson has no cited cards' });
  }

  const unresolved = results.filter((r) => r.reasons.includes('source:unresolved')).length;
  if (unresolved > 0) warnings.push({ code: 'source:unresolved', message: `${unresolved} cited card(s) have unresolved sources` });

  return {
    title: patch.set.title,
    objective: patch.set.objective,
    estimatedMinutes: patch.set.estimatedMinutes,
    cardCount: patch.cards.length,
    interactionCounts: counts,
    citedCardCount: cited,
    unresolvedSourceCount: unresolved,
    warnings,
  };
}

export function formatLessonSummary(s: LessonSummary): string[] {
  const mix = Object.entries(s.interactionCounts).map(([k, v]) => `${k} ${v}`).join(', ');
  const lines = [
    `Lesson: ${s.title}`,
    `${s.cardCount} activities${s.estimatedMinutes ? `, about ${s.estimatedMinutes} min` : ''}`,
    `Interaction mix: ${mix || 'none'}`,
    `Sources: ${s.citedCardCount} cited card(s)${s.unresolvedSourceCount ? `, ${s.unresolvedSourceCount} unresolved` : ''}`,
  ];
  if (s.objective) lines.push(`Objective: ${s.objective}`);
  for (const w of s.warnings) lines.push(`WARN ${w.code}${w.cardLocalId ? ` (${w.cardLocalId})` : ''}: ${w.message}`);
  return lines;
}
