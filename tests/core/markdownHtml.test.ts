import { describe, expect, it } from 'vitest';

import { renderMarkdownHtml } from '../../src/core/markdownHtml.js';

describe('renderMarkdownHtml', () => {
  it('renders headings, lists, inline code, and fenced blocks', () => {
    const html = renderMarkdownHtml([
      '# Title',
      '',
      'Paragraph with **bold** and `inline`.',
      '',
      '- one',
      '- two',
      '',
      '```ts',
      'const x = 1;',
      '```',
    ].join('\n'));

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>inline</code>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<pre><code class="language-ts">const x = 1;</code></pre>');
  });

  it('escapes raw HTML and unsafe link schemes', () => {
    const html = renderMarkdownHtml('<script>alert(1)</script>\n\n[javascript:alert(1)](javascript:alert(1))');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('href="javascript:');
  });
});
