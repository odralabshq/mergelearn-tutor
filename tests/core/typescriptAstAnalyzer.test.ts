import { describe, expect, it } from 'vitest';

import { analyzeTypeScriptAddedDiff, analyzeTypeScriptSource, sourceFromAddedDiff } from '../../src/core/analyzers/typescriptAst.js';

describe('TypeScript AST analyzer', () => {
  it('extracts source from added diff lines only', () => {
    expect(sourceFromAddedDiff(' context\n-old\n+export interface User { id: string }\n+++ b/file.ts')).toBe('export interface User { id: string }');
  });

  it('detects interfaces, type aliases, unions, generics, and async flow', () => {
    const findings = analyzeTypeScriptSource('export interface User { id: string }\nexport type Result<T> = { ok: true; value: T } | { ok: false };\nexport async function load<T>(): Promise<T | undefined> { return await Promise.resolve(undefined); }');
    const ids = findings.map((finding) => finding.conceptId);
    expect(ids).toContain('typescript.interfaces');
    expect(ids).toContain('typescript.type_aliases');
    expect(ids).toContain('typescript.union_types');
    expect(ids).toContain('typescript.generics');
    expect(ids).toContain('typescript.async_await');
    expect(findings.find((finding) => finding.conceptId === 'typescript.interfaces')?.symbol).toBe('User');
    expect(findings.find((finding) => finding.conceptId === 'typescript.union_types')?.symbol).toBe('Result');
  });

  it('detects React hook calls in TSX snippets', () => {
    const ids = analyzeTypeScriptAddedDiff('src/Counter.tsx', 'diff --git a/src/Counter.tsx b/src/Counter.tsx\n+const [count, setCount] = useState(0);\n+useEffect(() => { document.title = String(count); }, [count]);').map((finding) => finding.conceptId);
    expect(ids).toContain('react.hooks');
  });

  it('does not invent TypeScript concepts for plain assignments', () => {
    expect(analyzeTypeScriptAddedDiff('src/plain.ts', 'diff --git a/src/plain.ts b/src/plain.ts\n+const value = 1;')).toEqual([]);
  });
});
