import { describe, expect, it } from 'vitest';

import { planRequeue } from '../../src/session/requeue.js';

describe('planRequeue', () => {
  it('places an Again card after three intervening cards', () => {
    expect(planRequeue(10, 0, 0)).toEqual({ insertAt: 4, nextCount: 1 });
  });

  it('uses the end when fewer than three cards remain', () => {
    expect(planRequeue(4, 2, 0)).toEqual({ insertAt: 4, nextCount: 1 });
  });

  it('stops after two revisits to prevent an infinite sitting', () => {
    expect(planRequeue(10, 0, 2)).toBeNull();
  });
});
