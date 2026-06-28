function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

function inlineMarkdown(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const safeHref = escapeHtml(String(href).trim());
    if (!/^https?:\/\//i.test(safeHref) && !/^mailto:/i.test(safeHref)) return escapeHtml(String(label));
    return `<a href="${safeHref}" rel="noopener noreferrer">${escapeHtml(String(label))}</a>`;
  });
  return html;
}

function isBulletLine(line: string): boolean {
  return /^[-*]\s+/.test(line);
}

function isOrderedLine(line: string): boolean {
  return /^\d+\.\s+/.test(line);
}

function stripBullet(line: string): string {
  return line.replace(/^[-*]\s+/, '');
}

function stripOrdered(line: string): string {
  return line.replace(/^\d+\.\s+/, '');
}

function renderListBlock(lines: string[], ordered: boolean): string {
  const tag = ordered ? 'ol' : 'ul';
  const items = lines.map((line) => `<li>${inlineMarkdown(ordered ? stripOrdered(line) : stripBullet(line))}</li>`).join('');
  return `<${tag}>${items}</${tag}>`;
}

/** Render a safe subset of markdown to HTML for in-app display. */
export function renderMarkdownHtml(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  const blocks: string[] = [];
  const lines = normalized.split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (line.startsWith('```')) {
      const fenceLang = line.slice(3).trim();
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !(lines[index] ?? '').startsWith('```')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      const langClass = fenceLang ? ` class="language-${escapeHtml(fenceLang)}"` : '';
      blocks.push(`<pre><code${langClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1]!.length, 6);
      blocks.push(`<h${level}>${inlineMarkdown(headingMatch[2] ?? '')}</h${level}>`);
      index += 1;
      continue;
    }

    if (isBulletLine(line)) {
      const listLines: string[] = [];
      while (index < lines.length && isBulletLine(lines[index] ?? '')) {
        listLines.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push(renderListBlock(listLines, false));
      continue;
    }

    if (isOrderedLine(line)) {
      const listLines: string[] = [];
      while (index < lines.length && isOrderedLine(lines[index] ?? '')) {
        listLines.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push(renderListBlock(listLines, true));
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? '';
      if (!current.trim()) break;
      if (current.startsWith('```') || /^(#{1,6})\s+/.test(current) || isBulletLine(current) || isOrderedLine(current)) break;
      paragraphLines.push(current);
      index += 1;
    }
    blocks.push(`<p>${inlineMarkdown(paragraphLines.join(' '))}</p>`);
  }

  return blocks.join('\n');
}
