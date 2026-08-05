import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { importAgentSet } from '../../src/core/library/importAgentSet.js';
import { startReviewServer, type ReviewServer } from '../../src/session/server.js';

let running: ReviewServer | undefined;
afterEach(async () => { await running?.close(); running = undefined; });

async function manageHtml(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ml-manage-a11y-'));
  const result = await importAgentSet(root, {
    version: 1,
    set: { id: 'manage-a11y', title: 'Manage accessibility', tagIds: [] },
    tagPatch: { reuse: [], add: [{ localId: 'topic', label: 'Accessibility' }] },
    order: ['card'],
    cards: [{
      localId: 'card', tagRefs: ['topic'],
      front: { prompt: 'Where does focus move after loading more?' },
      back: { shortAnswer: 'To the first new card.', explanationMarkdown: 'This announces useful new content.' },
    }],
  });
  if (!result.ok) throw new Error('seed failed');
  running = await startReviewServer(root);
  return (await fetch(`${running.url}/manage`)).text();
}

describe('Manage paging accessibility', () => {
  it('labels filters, announces result counts, and moves focus to appended results', async () => {
    const html = await manageHtml();
    expect(html).toContain('<label>Search<input id="card-search"');
    expect(html).toContain('<label>Set<select id="card-set"');
    expect(html).toContain('<label>Tags<select id="card-tags" multiple>');
    expect(html).toContain('<label>Learning state<select id="card-state"');
    expect(html).toContain('id="card-status" role="status" aria-live="polite"');
    expect(html).toContain('id="load-more-cards"');
    expect(html).toContain('id="reload-cards"');
    expect(html).toContain('class="curation-card" tabindex="-1"');
    expect(html).toContain('if(expectedOffset>0&&newRows.length)newRows[0].focus();');
    expect(html).toContain("document.getElementById('reload-cards').focus()");
    expect(html).toContain("resetCardResults(action==='edit'?'Saved.':'Card updated.')");
    expect(html).toContain("(cardPage.notice?cardPage.notice+' ':'')+cardPage.offset+' of '+cardPage.total");
    expect(html).toContain("cardPage.notice=typeof notice==='string'?notice:''");
  });
});
