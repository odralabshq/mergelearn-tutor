export type DiffLine = {
  kind: 'add' | 'delete' | 'context' | 'meta';
  marker: string;
  text: string;
};

export function parseDiffSnippet(code: string): DiffLine[] {
  return code.split('\n').map((line) => {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) return { kind: 'meta', marker: line.slice(0, 2), text: line };
    if (line.startsWith('+')) return { kind: 'add', marker: '+', text: line.slice(1) };
    if (line.startsWith('-')) return { kind: 'delete', marker: '-', text: line.slice(1) };
    return { kind: 'context', marker: ' ', text: line.startsWith(' ') ? line.slice(1) : line };
  });
}

export function renderDiffSnippetHtml(code: string): string {
  const lines = parseDiffSnippet(code);
  return `<div class="diff-snippet" role="region" aria-label="Git diff snippet">${lines.map((line, index) => `<div class="diff-line ${line.kind}"><span class="line-no">${index + 1}</span><span class="marker">${escapeHtml(line.marker)}</span><code>${escapeHtml(line.text || ' ')}</code></div>`).join('')}</div>`;
}

export function diffSnippetCss(): string {
  return '.diff-snippet{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#08111f;border:1px solid #23344f;border-radius:16px;overflow:hidden;margin:14px 0}.diff-line{display:grid;grid-template-columns:44px 26px 1fr;gap:0;min-height:24px;align-items:center;font-size:13px;line-height:1.55}.diff-line code{white-space:pre-wrap;color:#dbeafe}.line-no{color:#64748b;text-align:right;padding-right:10px;user-select:none}.marker{text-align:center;color:#94a3b8}.diff-line.add{background:linear-gradient(90deg,rgba(22,101,52,.45),rgba(22,101,52,.12))}.diff-line.add .marker{color:#86efac}.diff-line.delete{background:linear-gradient(90deg,rgba(127,29,29,.48),rgba(127,29,29,.13))}.diff-line.delete .marker{color:#fca5a5}.diff-line.meta{background:#172033}.diff-line.meta code{color:#93c5fd}.diff-line.context{background:#0b1220}';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}
