/**
 * Authoring exemplars and per-plane Bloom targets (S4, doc 01).
 *
 * Two quality levers live here, both DATA (tune by editing this file, not code):
 *  1. planeBloom - the target cognitive level + a one-line "what a correct answer
 *     must demonstrate" per plane. This is the structural lever.
 *  2. exemplars - hand-written gold cards per plane for few-shot prompting.
 *
 * NOTE: this ships a small STARTER set (1-2 per plane), grounded in this repo.
 * Doc 05 calls for 6-8 per plane, hand-tuned against the eval set during the
 * test buffer (S5). Expanding this set is the main tuning activity - deliberately
 * left as data authoring, not a code change.
 */

import type { QuestionPlane } from './types.js';

export interface PlaneBloom {
  bloom: 'Remember' | 'Understand' | 'Apply' | 'Analyze' | 'Evaluate' | 'Create';
  mustDemonstrate: string;
}

export const planeBloom: Record<QuestionPlane, PlaneBloom> = {
  language_mechanics: { bloom: 'Understand',
    mustDemonstrate: 'explain what a language construct does and why it behaves that way here' },
  local_behavior: { bloom: 'Apply',
    mustDemonstrate: 'predict what this code does for a concrete input or call' },
  file_role: { bloom: 'Understand',
    mustDemonstrate: "state the file's responsibility and what depends on it" },
  architecture_flow: { bloom: 'Analyze',
    mustDemonstrate: 'trace how data moves across a boundary and name that boundary' },
  risk_and_tests: { bloom: 'Evaluate',
    mustDemonstrate: 'identify a failure mode and what would catch or prevent it' },
  repo_domain: { bloom: 'Understand',
    mustDemonstrate: 'connect the code to the domain concept it implements' },
};

/** A gold few-shot card. Kept minimal: the model sees prompt + answer shape. */
export interface Exemplar {
  prompt: string;
  expectedAnswer: string;
}

/**
 * Starter exemplars per plane (grounded in this repo). Expand to 6-8 during the
 * S5 tuning buffer. These are DATA - edit freely; no code change needed.
 */
export const exemplars: Record<QuestionPlane, Exemplar[]> = {
  language_mechanics: [
    { prompt: 'In tools.ts, readRange pops a trailing empty line before slicing. What bug does that prevent for a file ending in a newline?',
      expectedAnswer: "split('\\n') yields a spurious final '' element, so a 1-line file would count as 2 lines and the end-clamp would be wrong." },
  ],
  local_behavior: [
    { prompt: 'grepRepo passes an explicit "." search path to ripgrep. What happens if that path argument is omitted?',
      expectedAnswer: 'rg reads from stdin, which never closes under execFile, so the call hangs until timeout.' },
  ],
  file_role: [
    { prompt: 'What is the single responsibility of endpoint.ts, and what depends on the value it returns?',
      expectedAnswer: 'It resolves the LLM endpoint local-first; authorCard depends on its usable flag to decide whether to author or skip.' },
  ],
  architecture_flow: [
    { prompt: 'Trace how snippet text reaches an authored card. Where does the text actually come from, and where does it NOT come from?',
      expectedAnswer: 'The model cites a line range; authorCard re-fetches it via readRange from disk and freezes that text. It does NOT come from the model output.' },
  ],
  risk_and_tests: [
    { prompt: 'authorCard re-fetches the cited range instead of trusting the model. What failure mode does that guard against, and what test proves it?',
      expectedAnswer: 'It guards against hallucinated/altered snippet text; the "freezes the snippet from disk, not the model" test proves the stored text equals the real file bytes.' },
  ],
  repo_domain: [
    { prompt: 'The tool exposes planes like architecture_flow and risk_and_tests. What domain idea do these planes encode?',
      expectedAnswer: 'They encode distinct cognitive angles (Bloom levels) for teaching a codebase, so review covers mechanics through evaluation, not just recall.' },
  ],
};

/** Render the exemplars for one plane as a few-shot block (token-bounded). */
export function exemplarBlock(plane: QuestionPlane, limit = 8): string {
  const set = (exemplars[plane] ?? []).slice(0, limit);
  if (set.length === 0) return '(no exemplars)';
  return set.map((e, i) => `Example ${i + 1}:\nQ: ${e.prompt}\nA: ${e.expectedAnswer}`).join('\n\n');
}
