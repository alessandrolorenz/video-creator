import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
  write(
    root,
    'apps/desktop/package.json',
    '{"name":"@ai-video-assembly/desktop","private":true,"type":"module"}',
  );
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('repository boundary guard', () => {
  it('accepts the real M1.0 Checkpoint 1 repository', async () => {
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

  it('allows transcript to use its declared domain dependency at runtime', async () => {
    const root = repository();
    write(
      root,
      'packages/transcript/package.json',
      '{"name":"@ai-video-assembly/transcript","private":true,"type":"module","dependencies":{"@ai-video-assembly/domain":"workspace:*"}}',
    );
    write(
      root,
      'packages/transcript/src/index.ts',
      "import { timeUs } from '@ai-video-assembly/domain';\nexport const value = timeUs(1);\n",
    );

    expect(await checkRepository(root)).toEqual([]);
  });

  it('rejects an undeclared transcript workspace dependency', async () => {
    const root = repository();
    write(
      root,
      'packages/transcript/package.json',
      '{"name":"@ai-video-assembly/transcript","private":true,"type":"module"}',
    );
    write(
      root,
      'packages/transcript/src/index.ts',
      "import { timeUs } from '@ai-video-assembly/domain';\nvoid timeUs;\n",
    );

    expect((await checkRepository(root)).join('\n')).toContain(
      'workspace dependency @ai-video-assembly/domain is not declared',
    );
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
      'package.json: forbidden repository dependency openai',
    );
  });

  it('allows media to use its declared domain dependency at runtime', async () => {
    const root = repository();
    write(
      root,
      'packages/media/src/index.ts',
      "import { timeUs } from '@ai-video-assembly/domain';\nexport const value = timeUs(1);\n",
    );
    expect(await checkRepository(root)).toEqual([]);
  });

  it('keeps AI contracts limited to domain type-only imports', async () => {
    const root = repository();
    write(
      root,
      'packages/ai-contracts/package.json',
      '{"name":"@ai-video-assembly/ai-contracts","private":true,"type":"module","dependencies":{"@ai-video-assembly/domain":"workspace:*"}}',
    );
    write(
      root,
      'packages/ai-contracts/src/index.ts',
      "import { timeUs } from '@ai-video-assembly/domain';\nvoid timeUs;\n",
    );
    expect((await checkRepository(root)).join('\n')).toContain(
      'ai-contracts may import domain types only',
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

  it.each(['node:fs', 'electron', 'react'])(
    'rejects forbidden %s imports from transcript',
    async (specifier) => {
      const root = repository();
      write(
        root,
        'packages/transcript/package.json',
        '{"name":"@ai-video-assembly/transcript","private":true,"type":"module"}',
      );
      write(root, 'packages/transcript/src/index.ts', `import '${specifier}';\n`);

      expect((await checkRepository(root)).join('\n')).toContain(
        `framework-independent package imports forbidden ${specifier}`,
      );
    },
  );

  it('rejects the process global from transcript', async () => {
    const root = repository();
    write(
      root,
      'packages/transcript/package.json',
      '{"name":"@ai-video-assembly/transcript","private":true,"type":"module"}',
    );
    write(root, 'packages/transcript/src/index.ts', 'export const value = process.env.VALUE;\n');

    expect((await checkRepository(root)).join('\n')).toContain(
      'framework-independent package uses forbidden process global',
    );
  });

  it.each(['main-spoof', 'worker-copy', 'preload', 'renderer'])(
    'rejects Node imports from non-privileged desktop directory %s',
    async (directory) => {
      const root = repository();
      write(root, `apps/desktop/src/${directory}/index.ts`, "import 'node:fs';\n");

      expect((await checkRepository(root)).join('\n')).toContain(
        'desktop runtime source outside exact main/worker ownership imports forbidden node:fs',
      );
    },
  );

  it('allows Node imports in exact desktop main and worker ownership', async () => {
    const root = repository();
    write(root, 'apps/desktop/src/main/index.ts', "import 'node:path';\n");
    write(root, 'apps/desktop/src/worker/index.ts', "import 'node:child_process';\n");

    expect(await checkRepository(root)).toEqual([]);
  });

  it('rejects the process global outside exact desktop main/worker ownership', async () => {
    const root = repository();
    write(
      root,
      'apps/desktop/src/worker-copy/index.ts',
      'export const value = process.env.VALUE;\n',
    );

    expect((await checkRepository(root)).join('\n')).toContain(
      'desktop runtime source outside exact main/worker ownership uses forbidden process global',
    );
  });

  it('rejects binary fixtures and Git LFS configuration generated only in temp', async () => {
    const root = repository();
    write(root, 'sample.mp4', new Uint8Array([0, 1, 2, 3]));
    write(root, '.gitattributes', '*.mp4 filter=lfs diff=lfs merge=lfs -text\n');

    const errors = (await checkRepository(root)).join('\n');
    expect(errors).toContain('binary fixture is forbidden by repository policy: sample.mp4');
    expect(errors).toContain('Git LFS configuration is forbidden by repository policy');
  });

  it('rejects a Git LFS pointer even without a binary extension', async () => {
    const root = repository();
    write(
      root,
      'fixture.data',
      'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1\n',
    );

    expect((await checkRepository(root)).join('\n')).toContain(
      'Git LFS pointer is forbidden by repository policy: fixture.data',
    );
  });

  it('rejects binary content even when the extension is disguised', async () => {
    const root = repository();
    write(root, 'fixture.data', new Uint8Array([65, 0, 66]));

    expect((await checkRepository(root)).join('\n')).toContain(
      'binary content is forbidden by repository policy: fixture.data',
    );
  });

  it('skips ignored untracked smoke inputs but still rejects the same path when tracked', async () => {
    const root = repository();
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    write(root, '.gitignore', 'local-smoke-inputs/\n');
    write(root, 'local-smoke-inputs/private.mp4', new Uint8Array([0, 1, 2, 3]));

    expect(await checkRepository(root)).toEqual([]);

    execFileSync('git', ['add', '-f', 'local-smoke-inputs/private.mp4'], { cwd: root });
    expect((await checkRepository(root)).join('\n')).toContain(
      'binary fixture is forbidden by repository policy: local-smoke-inputs/private.mp4',
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
