import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkRepository } from '../../scripts/check-boundaries.mjs';

const temporaryRoots: string[] = [];

function write(root: string, path: string, contents: string | Uint8Array): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'ai-video-boundaries-'));
  temporaryRoots.push(root);
  write(root, 'package.json', '{"name":"fixture","private":true,"type":"module"}');
  write(
    root,
    'packages/domain/package.json',
    '{"name":"@ai-video-assembly/domain","private":true,"type":"module"}',
  );
  write(root, 'packages/domain/src/index.ts', 'export {};\n');
  write(
    root,
    'packages/timeline/package.json',
    '{"name":"@ai-video-assembly/timeline","private":true,"type":"module","dependencies":{"@ai-video-assembly/domain":"workspace:*"}}',
  );
  write(root, 'packages/timeline/src/index.ts', 'export {};\n');
  write(
    root,
    'packages/media/package.json',
    '{"name":"@ai-video-assembly/media","private":true,"type":"module","dependencies":{"@ai-video-assembly/domain":"workspace:*"}}',
  );
  write(root, 'packages/media/src/index.ts', 'export {};\n');
  write(
    root,
    'packages/export/package.json',
    '{"name":"@ai-video-assembly/export","private":true,"type":"module"}',
  );
  write(root, 'packages/export/src/index.ts', 'export {};\n');
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('repository boundary guard', () => {
  it('accepts the real Checkpoint 2 repository', async () => {
    expect(await checkRepository(join(import.meta.dirname, '../..'))).toEqual([]);
  });

  it.each([
    ['static import', "import '@ai-video-assembly/timeline';\n"],
    ['re-export', "export * from '@ai-video-assembly/timeline';\n"],
    ['dynamic import', "void import('@ai-video-assembly/timeline');\n"],
    ['CommonJS require', "require('@ai-video-assembly/timeline');\n"],
  ])('rejects a forbidden domain %s', async (_name, source) => {
    const root = repository();
    write(root, 'packages/domain/src/index.ts', source);

    expect((await checkRepository(root)).join('\n')).toContain(
      'domain must not import workspace package @ai-video-assembly/timeline',
    );
  });

  it('rejects relative imports that cross package roots', async () => {
    const root = repository();
    write(root, 'packages/domain/src/index.ts', "import '../../timeline/src/index.js';\n");

    expect((await checkRepository(root)).join('\n')).toContain('cross-package relative import');
  });

  it('allows timeline to import its declared domain dependency', async () => {
    const root = repository();
    write(root, 'packages/timeline/src/index.ts', "import '@ai-video-assembly/domain';\n");

    expect(await checkRepository(root)).toEqual([]);
  });

  it('rejects an undeclared workspace dependency', async () => {
    const root = repository();
    write(
      root,
      'packages/timeline/package.json',
      '{"name":"@ai-video-assembly/timeline","private":true,"type":"module"}',
    );
    write(root, 'packages/timeline/src/index.ts', "import '@ai-video-assembly/domain';\n");

    expect((await checkRepository(root)).join('\n')).toContain(
      'workspace dependency @ai-video-assembly/domain is not declared',
    );
  });

  it('rejects forbidden workspace edges declared only in a manifest', async () => {
    const root = repository();
    write(
      root,
      'packages/domain/package.json',
      '{"name":"@ai-video-assembly/domain","private":true,"type":"module","dependencies":{"@ai-video-assembly/timeline":"workspace:*"}}',
    );

    expect((await checkRepository(root)).join('\n')).toContain(
      'domain must not depend on workspace package @ai-video-assembly/timeline',
    );
  });

  it('rejects forbidden dependencies from the root manifest', async () => {
    const root = repository();
    write(
      root,
      'package.json',
      '{"name":"fixture","private":true,"type":"module","dependencies":{"openai":"1.0.0"}}',
    );

    expect((await checkRepository(root)).join('\n')).toContain(
      'package.json: forbidden M0.1 dependency openai',
    );
  });

  it('allows media to import domain types but rejects runtime imports', async () => {
    const root = repository();
    write(
      root,
      'packages/media/src/index.ts',
      "import type { TimeUs } from '@ai-video-assembly/domain';\nexport type { TimeUs };\n",
    );
    expect(await checkRepository(root)).toEqual([]);

    write(
      root,
      'packages/media/src/index.ts',
      "import { timeUs } from '@ai-video-assembly/domain';\nvoid timeUs;\n",
    );
    expect((await checkRepository(root)).join('\n')).toContain(
      'media may import domain types only',
    );
  });

  it.each(['node:fs', 'fs', 'electron', 'react', 'openai', 'fluent-ffmpeg'])(
    'rejects framework or provider import %s from domain',
    async (specifier) => {
      const root = repository();
      write(root, 'packages/domain/src/index.ts', `import '${specifier}';\n`);

      expect((await checkRepository(root)).join('\n')).toContain(
        `framework-independent package imports forbidden ${specifier}`,
      );
    },
  );

  it('rejects binary fixtures and Git LFS configuration generated only in temp', async () => {
    const root = repository();
    write(root, 'sample.mp4', new Uint8Array([0, 1, 2, 3]));
    write(root, '.gitattributes', '*.mp4 filter=lfs diff=lfs merge=lfs -text\n');

    const errors = (await checkRepository(root)).join('\n');
    expect(errors).toContain('binary fixture is forbidden in M0.1: sample.mp4');
    expect(errors).toContain('Git LFS configuration is forbidden in M0.1');
  });

  it('rejects a Git LFS pointer even without a binary extension', async () => {
    const root = repository();
    write(
      root,
      'fixture.data',
      'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1\n',
    );

    expect((await checkRepository(root)).join('\n')).toContain(
      'Git LFS pointer is forbidden in M0.1: fixture.data',
    );
  });

  it('rejects binary content even when the extension is disguised', async () => {
    const root = repository();
    write(root, 'fixture.data', new Uint8Array([65, 0, 66]));

    expect((await checkRepository(root)).join('\n')).toContain(
      'binary content is forbidden in M0.1: fixture.data',
    );
  });

  it('keeps the reserved export package empty', async () => {
    const root = repository();
    write(root, 'packages/export/src/index.ts', 'export const value = 1;\n');

    expect((await checkRepository(root)).join('\n')).toContain(
      'export package must not expose public symbols',
    );
  });

  it('rejects every import from the reserved export package', async () => {
    const root = repository();
    write(root, 'packages/export/src/index.ts', "import 'left-pad';\nexport {};\n");

    expect((await checkRepository(root)).join('\n')).toContain(
      'export package must not import left-pad',
    );
  });
});
