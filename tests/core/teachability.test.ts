import { describe, expect, it } from 'vitest';

import {
  isTeachablePath, filterTeachable, scoreSnippetTeachability, TEACHABILITY_FLOOR,
} from '../../src/core/teachability.js';

describe('path teachability (existing)', () => {
  it('denies vendored/generated paths and allows real source', () => {
    expect(isTeachablePath('src/queue.ts')).toBe(true);
    expect(isTeachablePath('node_modules/x/index.js')).toBe(false);
    expect(isTeachablePath('dist/bundle.min.js')).toBe(false);
    expect(isTeachablePath('types/foo.d.ts')).toBe(false);
    expect(filterTeachable(['src/a.ts', 'yarn.lock'])).toEqual(['src/a.ts']);
  });
});

describe('range-content teachability (eval blind-spot fix)', () => {
  it('scores real logic as teachable', () => {
    const code = [
      'export function dequeue(items) {',
      '  const first = items.shift();',
      '  if (first === undefined) throw new Error("empty");',
      '  return first;',
      '}',
    ].join('\n');
    const s = scoreSnippetTeachability(code);
    expect(s.teachable).toBe(true);
    expect(s.ratio).toBeGreaterThan(TEACHABILITY_FLOOR);
  });

  it('flags a comment-dominated range as low signal', () => {
    const code = [
      '// This function does something important.',
      '// It has several lines of explanation.',
      '/* a block comment */',
      '  const x = 1;',
    ].join('\n');
    const s = scoreSnippetTeachability(code);
    expect(s.teachable).toBe(false);
    expect(s.reason).toMatch(/low signal/);
  });

  it('flags an import-only range as low signal', () => {
    const code = [
      "import { a } from './a.js';",
      "import { b } from './b.js';",
      "import { c } from './c.js';",
    ].join('\n');
    expect(scoreSnippetTeachability(code).teachable).toBe(false);
  });

  it('flags a brace/punctuation-only range as low signal', () => {
    const code = ['  }', '});', ']', ')'].join('\n');
    expect(scoreSnippetTeachability(code).teachable).toBe(false);
  });

  it('an empty snippet scores 0 (never throws)', () => {
    const s = scoreSnippetTeachability('   \n  \n');
    expect(s.ratio).toBe(0);
    expect(s.teachable).toBe(false);
  });

  it('counts substantive vs non-blank lines correctly', () => {
    const code = ['const a = 1;', '', '// note', 'return a;'].join('\n');
    const s = scoreSnippetTeachability(code);
    expect(s.nonBlank).toBe(3);      // two code lines + one comment
    expect(s.substantive).toBe(2);   // the two code lines
  });
});
