import { describe, expect, it } from 'vitest';

import { parseDiffSnippet, renderDiffSnippetHtml } from '../../src/core/diffView.js';

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
});
