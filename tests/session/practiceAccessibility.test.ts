import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { startReviewServer, type ReviewServer } from '../../src/session/server.js';
import { importAgentSet } from '../../src/core/library/importAgentSet.js';
import type { AgentSetPatch } from '../../src/core/library/types.js';

let running: ReviewServer | undefined;
afterEach(async () => { await running?.close(); running = undefined; });

async function seed(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ml-a11y-'));
  const res = await importAgentSet(root, {
    version: 1,
    set: { id: 'a11y-deck', title: 'A11y deck', tagIds: [] },
    tagPatch: { reuse: [], add: [] },
    order: ['c1'],
    cards: [{
      localId: 'c1', tagRefs: [],
      problemRefs: [{ sourceName: 'Interview list', sourceId: 'a11y-ref', canonicalUrl: 'https://example.org/a11y' }],
      front: { prompt: 'Is the reveal announced?' },
      back: { shortAnswer: 'It should be.', explanationMarkdown: 'Otherwise nobody hears it.' },
    }],
  } as AgentSetPatch);
  if (!res.ok) throw new Error('seed failed');
  return root;
}

const fetchText = async (url: string): Promise<string> => (await fetch(url)).text();

describe('Practice planning views are accessible and URL-driven', () => {
  it('exposes labeled filters, truthful boundaries, and safe external handoff semantics', async () => {
    running = await startReviewServer(await seed());
    const strengthen = await fetchText(`${running.url}/practice/strengthen?source=Interview%20list`);
    const external = await fetchText(`${running.url}/practice/external?source=Interview%20list`);

    expect(strengthen).toContain('<a href="/practice" aria-current="true">Practice</a>');
    expect(strengthen).toContain('<form class="prepare-filters" method="get" action="/practice/strengthen" aria-label="Practice filters">');
    expect(strengthen).toContain('<label>Set<input name="set"');
    expect(strengthen).toContain('<label>Tag<input name="tag"');
    expect(strengthen).not.toContain('<input name="source"');
    expect(strengthen).toContain('<section aria-labelledby="strengthen-heading"><h1 id="strengthen-heading">Strengthen weak areas</h1>');
    expect(strengthen).toContain('role="note">Source was not applied to retrieval evidence.');

    expect(external).toContain('<form class="prepare-filters" method="get" action="/practice/external" aria-label="Practice filters">');
    expect(external).toContain('<label>Source<input name="source" value="Interview list">');
    expect(external).toContain('<section aria-labelledby="external-heading"><h1 id="external-heading">External problems</h1>');
    expect(external).toContain('Nothing here is graded or scheduled, no result is recorded, and this view does not assert readiness.');
    expect(external).not.toContain('Source filters apply only to Practice externally');
    expect(external).not.toContain('Import preparation example');
    expect(external).toContain('target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"');
    expect(external).toContain('aria-label="Practice externally: open Interview list · a11y-ref in a new tab"');
    const main = external.match(/<main>([\s\S]*?)<\/main>/)?.[1] ?? '';
    expect(main).not.toContain('ml-prepare');
    expect(main).not.toContain('prepare-filter-state');
    expect(main).not.toContain('data-server-mutation');
    expect(external).not.toContain('/api/prepare');
  });
});

describe('practice reveals are announced to assistive technology', () => {
  it('marks the attempt review as a live region', async () => {
    running = await startReviewServer(await seed());
    const html = await fetchText(`${running.url}/practice/session`);
    // Checking answer inserts the result WITHOUT moving focus, so without a
    // live region a screen-reader user is never told the outcome arrived.
    expect(html).toContain('id="attempt-review" aria-live="polite"');
  });

  it('marks the session status as a live region', async () => {
    running = await startReviewServer(await seed());
    const html = await fetchText(`${running.url}/practice/session`);
    expect(html).toContain('id="status" aria-live="polite"');
    expect(html).toContain('id="retry-guidance"');
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).toContain('aria-describedby="retry-guidance"');
  });

  it('keeps the inline client parseable after the markup change', async () => {
    running = await startReviewServer(await seed());
    const html = await fetchText(`${running.url}/practice/session`);
    const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
    expect(script).toBeTruthy();
    // The client is a string literal, so tsc cannot see inside it.
    expect(() => new Function(script!)).not.toThrow();
  });

  it('uses the server plan as the only Practice cursor and retains uncertain requests', async () => {
    running = await startReviewServer(await seed());
    const html = await fetchText(`${running.url}/practice/session`);
    const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1] ?? '';
    expect(script).toContain('function applySessionState');
    expect(script).toContain("heading.textContent=practiceMode==='lesson'?'Learn':'Review'");
    expect(script).toContain('entryId:currentEntryId');
    expect(script).toContain('requestId:pendingRequestId');
    expect(script).toContain('var sentBody=pendingRequestBody');
    expect(script).toContain('JSON.stringify(sentBody)');
    expect(script).toContain("else statusMsg('Grade saved, but the page could not refresh. Reload to continue.')");
    expect(script).toContain("queue=j.current?[j.current.card]:[]");
    expect(script).not.toContain("fetch('/api/due'");
    expect(script).not.toContain('planRequeue');
    expect(script).not.toContain("addEventListener('beforeunload'");
    expect(html).toContain('id="end-session"');
    expect(script).toContain('function endCurrentSession');
    expect(script).toContain('function intentKey');
    expect(script).toContain('function sessionKey');
    expect(script).toContain('sessionKey(sj)!==intentKey(sessionBody)');
    expect(script).toContain("pendingStartKey='ml-pending-session-start'");
    expect(script).toContain('localStorage.setItem(pendingStartKey,startBody)');
    expect(script).toContain("body:startBody");
    expect(script).toContain('localStorage.removeItem(pendingStartKey)');
    expect(script.indexOf('sj=await sr.json()')).toBeLessThan(script.indexOf('localStorage.removeItem(pendingStartKey)'));
    expect(script).toContain("if(!j.state&&j.retryable){var kept='Answer kept for retry:");
    expect(script).toContain("if(!j.state){pendingRequestId=null;pendingRequestBody=null;clearRetryGuidance()");
    expect(script).toContain("pendingUndoBody=null;applySessionState(j.state)");
    expect(script).toContain("if(!j.state&&j.retryable){retryGuidance('Undo kept for retry.')");
    expect(script).toContain("if(j.state){pendingRequestId=null;pendingRequestBody=null;applySessionState(j.state);}");
    expect(script).toContain('lastGrade=null;clearRetryGuidance();render();syncUndo()');
    expect(script).toContain('retryGuidance(retryText)');
    expect(script).toContain("j.requeued?'Again · queued for another look'");
    expect(script).toContain('Lesson sitting complete');
    expect(script).toContain("planRemaining>0?'This session changed. Reload to continue.'");
    expect(script).toContain("startFailure?'Session could not start. '");
    expect(script).toContain("startFailure=sj.error||'Try again after restoring session write access.'");
    expect(script).toContain("continueButton&&sessionId");
    expect(script).toContain("'<a class=\"secondary-action\" id=\"continue-session\" href=\"'");
    expect(script).toContain('lastGrade=null;clearRetryGuidance();explicitlyEnded=true;render()');
    expect(script).toContain('<div class="done-note" tabindex="-1">');
    expect(script).toContain('plannedCount=Number(j.plannedCount)||0');
    expect(script).toContain('revisitRemaining=Number(j.revisitRemaining)||0');
    expect(script).toContain("revisitRemaining+' revisit'");
    expect(script).toContain("Card was archived · skipped");
    expect(script).toContain('function syncEnd');
    expect(script).toContain("Saved answer is '+(['','Again','Hard','Good','Easy'][pendingRequestBody.rating])");
    expect(script).toContain("setIds:[body.lessonSetId],folderPaths:[],tagIds:[],combinator:'union'");
    expect(script).toContain('planRemaining===0');
    expect(script).toContain("'Activity '+position+' of '+plannedCount");
    expect(script).toContain("planRemaining+' card'+(planRemaining===1?'':'s')+' remaining'");
    expect(script).toContain('queue=[];waitingBacklog+=planRemaining;planRemaining=0;');
  });
});

describe('finishing a session always offers a way forward', () => {
  it('ships forward actions for both the completed and empty states', async () => {
    running = await startReviewServer(await seed());
    const script = (await fetchText(`${running.url}/practice/session`))
      .match(/<script>([\s\S]*?)<\/script>/i)?.[1] ?? '';
    // With a backlog: continue reviewing. Without one: the two things actually
    // worth doing next, instead of a dead end.
    expect(script).toContain('Review next sitting');
    expect(script).toContain('Back to lessons');
    expect(script).toContain('See your progress');
    expect(script).toContain('emptyNext');
  });
});
