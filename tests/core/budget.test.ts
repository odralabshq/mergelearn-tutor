import { describe, expect, it } from 'vitest';

import { BudgetTracker, DEFAULT_BUDGET } from '../../src/core/budget.js';

describe('BudgetTracker', () => {
  it('starts with room to proceed', () => {
    const b = new BudgetTracker({ maxCards: 2, maxTokens: 1000 });
    expect(b.canProceed()).toBe(true);
    expect(b.snapshot().stoppedReason).toBeUndefined();
  });

  it('stops after the card ceiling is reached', () => {
    const b = new BudgetTracker({ maxCards: 2, maxTokens: 1_000_000 });
    b.chargeCard();
    expect(b.canProceed()).toBe(true);
    b.chargeCard();
    expect(b.canProceed()).toBe(false);
    expect(b.snapshot().stoppedReason).toBe('cards');
  });

  it('stops after the token ceiling is reached', () => {
    const b = new BudgetTracker({ maxCards: 100, maxTokens: 500 });
    b.chargeTokens(300);
    expect(b.canProceed()).toBe(true);
    b.chargeTokens(250);
    expect(b.canProceed()).toBe(false);
    expect(b.snapshot().stoppedReason).toBe('tokens');
  });

  it('enforces cost only when a cost ceiling is configured', () => {
    const noCost = new BudgetTracker({ maxCards: 100, maxTokens: 1_000_000 });
    noCost.chargeTokens(10, 999);
    expect(noCost.canProceed()).toBe(true); // cost ignored when maxCostUsd undefined

    const withCost = new BudgetTracker({ maxCards: 100, maxTokens: 1_000_000, maxCostUsd: 1 });
    withCost.chargeTokens(10, 1.5);
    expect(withCost.canProceed()).toBe(false);
    expect(withCost.snapshot().stoppedReason).toBe('cost');
  });

  it('ignores negative charges (defensive)', () => {
    const b = new BudgetTracker({ maxCards: 100, maxTokens: 1000 });
    b.chargeTokens(-50, -5);
    const s = b.snapshot();
    expect(s.tokens).toBe(0);
    expect(s.costUsd).toBe(0);
  });

  it('accumulates a usage snapshot across charges', () => {
    const b = new BudgetTracker({ maxCards: 10, maxTokens: 10_000 });
    b.chargeCard();
    b.chargeTokens(120, 0.02);
    b.chargeTokens(80, 0.01);
    const s = b.snapshot();
    expect(s.cards).toBe(1);
    expect(s.tokens).toBe(200);
    expect(s.costUsd).toBeCloseTo(0.03, 5);
  });

  it('exposes documented defaults', () => {
    expect(DEFAULT_BUDGET.maxCards).toBe(25);
    expect(DEFAULT_BUDGET.maxTokens).toBe(200_000);
  });
});
