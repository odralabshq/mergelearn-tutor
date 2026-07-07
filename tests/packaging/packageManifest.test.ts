import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

type PackageJson = {
  main?: string;
  types?: string;
  files?: string[];
  private?: boolean;
  license?: string;
  bin?: Record<string, string>;
  scripts?: Record<string, string>;
};

describe('package beta-readiness manifest', () => {
  it('points package consumers at built artifacts only', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as PackageJson;

    expect(pkg.main).toBe('dist/index.js');
    expect(pkg.types).toBe('dist/index.d.ts');
    expect(pkg.bin?.['mergelearn']).toBe('./dist/libCli.js');
    expect(pkg.bin?.['mergelearn-tutor']).toBeUndefined();
    expect(pkg.files).toEqual(['dist/', 'docs/*.md', 'docs/assets/screenshots/*.png', 'LICENSE']);
    expect(pkg.scripts?.['smoke:package']).toBe('node scripts/packaged-smoke.mjs');
  });

  it('keeps public release blocked on human name/license/distribution approval', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as PackageJson;

    expect(pkg.private).toBe(true);
    expect(pkg.license).toBe('PolyForm-Noncommercial-1.0.0');
  });
});
