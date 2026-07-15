import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

type PackageJson = {
  name?: string;
  version?: string;
  main?: string;
  types?: string;
  files?: string[];
  private?: boolean;
  license?: string;
  bin?: Record<string, string>;
  scripts?: Record<string, string>;
  publishConfig?: { access?: string };
  repository?: { url?: string };
};

describe('public package manifest', () => {
  it('points consumers at the complete built artifact', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as PackageJson;
    expect(pkg.name).toBe('mergelearn');
    expect(pkg.version).toBe('0.1.0');
    expect(pkg.main).toBe('dist/index.js');
    expect(pkg.types).toBe('dist/index.d.ts');
    expect(pkg.bin?.mergelearn).toBe('./dist/libCli.js');
    expect(pkg.files).toEqual(['dist/', 'skills/', 'examples/', 'docs/*.md', 'docs/assets/screenshots/*.png', 'LICENSE']);
    expect(pkg.scripts?.['smoke:package']).toBe('node scripts/packaged-smoke.mjs');
  });

  it('is prepared for an explicit public publish under the approved name/license', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as PackageJson;
    expect(pkg.private).not.toBe(true);
    expect(pkg.publishConfig?.access).toBe('public');
    expect(pkg.license).toBe('PolyForm-Noncommercial-1.0.0');
    expect(pkg.repository?.url).toContain('odralabshq/mergelearn-tutor');
  });
});
