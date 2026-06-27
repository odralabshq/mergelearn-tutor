import { describe, expect, it } from 'vitest';

import { parseDiffSnippet, renderDiffSnippetHtml } from '../../src/core/diffView.js';
import { compactUnifiedDiffSnippet, diffForPath, isUnifiedDiffSnippet } from '../../src/core/diffEvidence.js';

describe('diff snippet rendering', () => {
  it('classifies git-style snippet lines', () => {
    const lines = parseDiffSnippet('+added\n-deleted\n context\n@@ hunk');
    expect(lines.map((line) => line.kind)).toEqual(['add', 'delete', 'context', 'meta']);
  });

  it('renders escaped diff HTML with line numbers', () => {
    const html = renderDiffSnippetHtml('+const value = "<safe>";');
    expect(html).toContain('diff-line add');
    expect(html).toContain('&lt;safe&gt;');
    expect(html).toContain('line-no');
  });

  it('compacts per-file unified diff evidence without noisy headers', () => {
    const diff = [
      'diff --git a/docs/timeline.md b/docs/timeline.md',
      'index 111..222 100644',
      '--- a/docs/timeline.md',
      '+++ b/docs/timeline.md',
      '@@ -1,2 +1,3 @@',
      ' # Timeline',
      '-old note',
      '+new note',
      '+extra evidence',
    ].join('\n');

    const snippet = compactUnifiedDiffSnippet(diffForPath(diff, 'docs/timeline.md')) ?? '';

    expect(snippet).toContain('@@');
    expect(snippet).toContain('-old note');
    expect(snippet).toContain('+new note');
    expect(snippet).not.toContain('diff --git');
    expect(snippet).not.toContain('+++ b/docs/timeline.md');
    expect(isUnifiedDiffSnippet(snippet)).toBe(true);
  });
});
