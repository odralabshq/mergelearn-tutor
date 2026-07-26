export const REQUEUE_GAP = 3;
export const MAX_REQUEUE = 2;

export type RequeuePlan = { insertAt: number; nextCount: number };

/** Plan a bounded same-sitting revisit. Pure and JavaScript-compatible so the
 * exact function can also be embedded in the framework-free browser client. */
export function planRequeue(
  queueLength: number,
  currentIndex: number,
  priorCount: number,
  gap = REQUEUE_GAP,
  max = MAX_REQUEUE,
): RequeuePlan | null {
  if (priorCount >= max) return null;
  return {
    insertAt: Math.min(queueLength, currentIndex + 1 + gap),
    nextCount: priorCount + 1,
  };
}
