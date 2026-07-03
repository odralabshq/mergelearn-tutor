/**
 * Per-run budget guard (S8b, doc 04 delivery constraint).
 *
 * A single authoring or review run makes many LLM calls (author + answer-key
 * derive + judge, per card). Without a ceiling a bad prompt or a loop can burn
 * an endpoint's tokens/cost or flood a deck. This is a pure accumulator the
 * caller consults before each unit of work and charges after each LLM call.
 *
 * Ceilings are advisory-hard: `canAuthorMore()` / `withinTokenBudget()` return
 * false once a ceiling is reached, and the caller stops cleanly (a partial run
 * that respects the budget is the correct outcome, not an error).
 */

export interface BudgetLimits {
  /** Max cards to author/promote in one run. */
  maxCards: number;
  /** Max total tokens (prompt + completion) across all LLM calls in the run. */
  maxTokens: number;
  /** Optional cost ceiling in USD; ignored when undefined. */
  maxCostUsd?: number;
}

export const DEFAULT_BUDGET: BudgetLimits = { maxCards: 25, maxTokens: 200_000 };

export interface BudgetUsage {
  cards: number;
  tokens: number;
  costUsd: number;
  /** Why the run stopped, if it did. */
  stoppedReason?: 'cards' | 'tokens' | 'cost';
}

/**
 * Mutable per-run accumulator. Consult canProceed() before starting a card and
 * chargeTokens()/chargeCost() after each LLM call. Ceilings are inclusive: once
 * usage reaches a limit, canProceed() returns false and records why.
 */
export class BudgetTracker {
  private usage: BudgetUsage = { cards: 0, tokens: 0, costUsd: 0 };

  constructor(private limits: BudgetLimits = DEFAULT_BUDGET) {}

  /** True if there is room to author at least one more card. */
  canProceed(): boolean {
    return this.reasonToStop() === undefined;
  }

  /** The ceiling that is blocking further work, or undefined if there is room. */
  reasonToStop(): 'cards' | 'tokens' | 'cost' | undefined {
    if (this.usage.cards >= this.limits.maxCards) return 'cards';
    if (this.usage.tokens >= this.limits.maxTokens) return 'tokens';
    if (this.limits.maxCostUsd !== undefined && this.usage.costUsd >= this.limits.maxCostUsd) return 'cost';
    return undefined;
  }

  /** Record a completed card. */
  chargeCard(): void {
    this.usage.cards += 1;
  }

  /** Record tokens (and optional cost) consumed by an LLM call. */
  chargeTokens(tokens: number, costUsd = 0): void {
    this.usage.tokens += Math.max(0, tokens);
    this.usage.costUsd += Math.max(0, costUsd);
  }

  /** A snapshot of usage, with stoppedReason filled in if a ceiling is hit. */
  snapshot(): BudgetUsage {
    return { ...this.usage, stoppedReason: this.reasonToStop() };
  }
}
