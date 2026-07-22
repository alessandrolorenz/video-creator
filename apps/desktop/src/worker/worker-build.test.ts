import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const desktopRoot = join(import.meta.dirname, '../..');

describe('utility worker build target', () => {
  it('owns a dedicated worker compiler target and desktop scripts', () => {
    const manifest = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const config = JSON.parse(readFileSync(join(desktopRoot, 'tsconfig.worker.json'), 'utf8')) as {
      compilerOptions: { outDir: string; rootDir: string };
      include: string[];
    };

    expect(manifest.scripts['build:worker']).toBe('tsc6 -p tsconfig.worker.json');
    expect(manifest.scripts.build).toContain('build:worker');
    expect(manifest.scripts.typecheck).toContain('tsconfig.worker.json');
    expect(config.compilerOptions).toMatchObject({ outDir: 'dist/worker', rootDir: 'src/worker' });
    expect(config.include).toEqual(['src/worker/**/*.ts']);
  });
});
