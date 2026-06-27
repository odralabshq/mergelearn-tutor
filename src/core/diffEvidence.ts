export function diffForPath(diff: string, path: string): string {
  const marker = `diff --git a/${path} b/${path}`;
  const start = diff.indexOf(marker);
  if (start < 0) return diff;
  const next = diff.indexOf('\ndiff --git ', start + marker.length);
  return diff.slice(start, next < 0 ? undefined : next);
}

export function compactUnifiedDiffSnippet(
  fileDiff: string,
  options: { maxLines?: number; contextRadius?: number; fallback?: string } = {},
): string | undefined {
  const maxLines = options.maxLines ?? 18;
  const contextRadius = options.contextRadius ?? 3;
  const lines = fileDiff.split('\n').filter((line) => !isNoisyDiffHeader(line));
  const usefulIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.startsWith('@@') || isChangedLine(line))
    .map(({ index }) => index);

  if (usefulIndexes.length === 0) return options.fallback;

  const selected = new Set<number>();
  for (const index of usefulIndexes) {
    const start = Math.max(0, index - contextRadius);
    const end = Math.min(lines.length - 1, index + contextRadius);
    for (let cursor = start; cursor <= end; cursor += 1) selected.add(cursor);
  }

  const compact = [...selected]
    .sort((a, b) => a - b)
    .slice(0, maxLines)
    .map((index) => lines[index])
    .join('\n')
    .trim();

  return compact || options.fallback;
}

export function isUnifiedDiffSnippet(snippet: string): boolean {
  const lines = snippet.split('\n');
  return lines.some((line) => line.startsWith('@@'))
    || (lines.some((line) => line.startsWith('+') && !line.startsWith('+++')) && lines.some((line) => line.startsWith('-') && !line.startsWith('---')));
}

function isChangedLine(line: string): boolean {
  return (line.startsWith('+') && !line.startsWith('+++')) || (line.startsWith('-') && !line.startsWith('---'));
}

function isNoisyDiffHeader(line: string): boolean {
  return line.startsWith('diff --git ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ');
}
