import ts from 'typescript';

export type AstConceptFinding = {
  conceptId: string;
  reason: string;
  symbol?: string;
};

export function sourceFromAddedDiff(fileDiff: string): string {
  return fileDiff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
}

export function analyzeTypeScriptSource(source: string, fileName = 'snippet.ts'): AstConceptFinding[] {
  if (!source.trim()) return [];
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = new Map<string, { reason: string; symbol?: string }>();
  const add = (conceptId: string, reason: string, symbol?: string) => found.set(conceptId, found.get(conceptId) ?? { reason, symbol });

  function visit(node: ts.Node): void {
    if (ts.isInterfaceDeclaration(node)) add('typescript.interfaces', `interface ${node.name.text}`, node.name.text);
    if (ts.isTypeAliasDeclaration(node)) {
      add('typescript.type_aliases', `type alias ${node.name.text}`, node.name.text);
      if (ts.isUnionTypeNode(node.type)) add('typescript.union_types', `union type alias ${node.name.text}`, node.name.text);
      if (node.typeParameters?.length) add('typescript.generics', `generic type alias ${node.name.text}`, node.name.text);
    }
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) && node.typeParameters?.length) add('typescript.generics', 'generic function or method');
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) add('typescript.async_await', 'async function');
    if (ts.isAwaitExpression(node)) add('typescript.async_await', 'await expression');
    if (ts.isCallExpression(node)) {
      const text = node.expression.getText(sf);
      if (text === 'useState' || text === 'useEffect' || text.endsWith('.useState') || text.endsWith('.useEffect')) add('react.hooks', `React hook ${text}`);
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return [...found.entries()].map(([conceptId, finding]) => ({ conceptId, ...finding }));
}

export function analyzeTypeScriptAddedDiff(filePath: string, fileDiff: string): AstConceptFinding[] {
  if (!/\.[cm]?[tj]sx?$/.test(filePath)) return [];
  return analyzeTypeScriptSource(sourceFromAddedDiff(fileDiff), filePath);
}
