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

/** Language keywords carry no topical meaning, so two blocks sharing only
 * `const` are not genuinely related. Stripping them keeps the dependency check
 * conservative: it prefers missing an ambiguity over crying wolf. */
const COMMON_TOKENS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'then', 'end',
  'await', 'async', 'new', 'this', 'import', 'export', 'from', 'type', 'interface', 'class', 'def',
  'public', 'private', 'static', 'true', 'false', 'null', 'undefined', 'void', 'try', 'catch',
  'int', 'str', 'string', 'number', 'boolean', 'bool', 'self', 'in', 'of', 'not', 'and', 'or',
]);

/** Meaningful identifiers in a snippet, lowercased. */
function identifiersOf(code: string): Set<string> {
  const words = (code.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [])
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1 && !COMMON_TOKENS.has(w));
  return new Set(words);
}

const CONTENT_WORD = /[A-Za-z][A-Za-z0-9'-]*/g;
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these',
  'those', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'and', 'or', 'but', 'if', 'then',
  'than', 'so', 'as', 'not', 'no', 'do', 'does', 'did', 'you', 'your', 'we', 'they', 'what', 'why',
  'how', 'when', 'which', 'who', 'will', 'would', 'can', 'could', 'should', 'from', 'into', 'has',
]);

function contentWords(text: string): string[] {
  return (text.match(CONTENT_WORD) ?? [])
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Share of the answer's content words that already appear in the prompt.
 * Catches a PARAPHRASED leak, which the verbatim includes() check cannot see. */
export function answerOverlapRatio(prompt: string, shortAnswer: string): number {
  const answerWords = contentWords(shortAnswer);
  if (answerWords.length < 3) return 0; // too short to judge
  const promptWords = new Set(contentWords(prompt));
  const shared = answerWords.filter((w) => promptWords.has(w)).length;
  return shared / answerWords.length;
}

/** Below this, an explanation is a restatement rather than teaching. */
const THIN_EXPLANATION_CHARS = 80;
/** Above this, the prompt is largely giving the answer away in other words. */
const OVERLAP_WARN_RATIO = 0.7;

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
      // Adjacent blocks that share no identifier can usually be swapped without
      // changing behaviour, so the single `correctOrder` marks a correct learner
      // wrong. That teaches the wrong thing, which is worse than teaching
      // nothing, and no structural gate can see it.
      const byId = new Map(card.interaction.blocks.map((b) => [b.id, b.code ?? '']));
      const order = card.interaction.correctOrder ?? [];
      for (let i = 1; i < order.length; i += 1) {
        const previous = identifiersOf(byId.get(order[i - 1]!) ?? '');
        const current = identifiersOf(byId.get(order[i]!) ?? '');
        if (previous.size === 0 || current.size === 0) continue;
        if ([...current].some((token) => previous.has(token))) continue;
        warnings.push({
          code: 'parsons:ambiguous_order',
          message: `Parsons blocks ${i} and ${i + 1} share no identifier, so their order may be arbitrary; `
            + 'a learner who swaps them would be marked wrong',
          cardLocalId: card.localId,
        });
      }
    }

    const explanation = card.back?.explanationMarkdown?.trim() ?? '';
    if (explanation.length > 0 && explanation.length < THIN_EXPLANATION_CHARS) {
      warnings.push({
        code: 'card:thin_explanation',
        message: `Explanation is ${explanation.length} characters; too short to explain WHY`,
        cardLocalId: card.localId,
      });
    }

    const overlap = answerOverlapRatio(card.front?.prompt ?? '', card.back?.shortAnswer ?? '');
    if (overlap >= OVERLAP_WARN_RATIO) {
      warnings.push({
        code: 'card:answer_overlap',
        message: `${Math.round(overlap * 100)}% of the answer's words already appear in the prompt; `
          + 'the card may be testing reading rather than recall',
        cardLocalId: card.localId,
      });
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
