import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const desktopRoot = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(desktopRoot, '../..');
const tsc = resolve(repositoryRoot, 'node_modules/.bin/tsc6');
const electron = createRequire(import.meta.url)('electron') as string;
const temporaryRoots: string[] = [];

function sanitizedStderrPreview(stderr: string, temporaryRoot: string): string {
  return stderr
    .replaceAll(temporaryRoot, '<temporary-root>')
    .replaceAll(repositoryRoot, '<repository-root>')
    .split(/\r?\n/u)
    .map((line) =>
      line.replace(/(^|[\s("'=])\/(?:[^\s"'():]+\/)*[^\s"'():]*/gu, '$1<absolute-path>'),
    )
    .filter((line) => line.length > 0)
    .slice(0, 12)
    .join(' | ')
    .slice(0, 1_500);
}

const validProbeJson = JSON.stringify({
  streams: [
    {
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      width: 1280,
      height: 720,
      avg_frame_rate: '30/1',
      r_frame_rate: '30/1',
      time_base: '1/90000',
    },
    {
      index: 1,
      codec_type: 'audio',
      codec_name: 'aac',
      sample_rate: '48000',
      channels: 2,
    },
  ],
  format: { format_name: 'mov,mp4', duration: '2.0' },
});

async function executable(path: string, versionOutput: string): Promise<void> {
  const script = `#!${process.execPath}\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nif (args[0] === '-version') { process.stdout.write(${JSON.stringify(versionOutput)}); process.exit(0); }\nconst marker = fs.readFileSync(args.at(-1), 'utf8').trim();\nif (marker === 'failure') process.exit(2);\nif (marker === 'slow') { setTimeout(() => process.stdout.write(${JSON.stringify(validProbeJson)}), 10000); } else { process.stdout.write(${JSON.stringify(validProbeJson)}); }\n`;
  await writeFile(path, script, 'utf8');
  await chmod(path, 0o700);
}

function buildUtilityIntegrationArtifacts(): void {
  for (const config of [
    'packages/domain/tsconfig.build.json',
    'packages/media/tsconfig.build.json',
    'packages/transcript/tsconfig.build.json',
    'apps/desktop/tsconfig.main.json',
    'apps/desktop/tsconfig.worker.json',
  ]) {
    execFileSync(tsc, ['-p', resolve(repositoryRoot, config)], { stdio: 'pipe' });
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('real Electron utility-process integration', () => {
  it('runs the compiled worker with text-only fakes for success, failure, cancellation, redaction, and shutdown', async () => {
    buildUtilityIntegrationArtifacts();
    const root = await mkdtemp(resolve(tmpdir(), 'ai-video-assembly-cp5-'));
    temporaryRoots.push(root);
    const goodExecutable = resolve(root, 'fake-probe-good.js');
    const badExecutable = resolve(root, 'fake-probe-bad.js');
    const successfulMedia = resolve(root, 'success.mov');
    const failedMedia = resolve(root, 'failure.mov');
    const slowMedia = resolve(root, 'slow.mov');
    await executable(goodExecutable, 'ffprobe version fake-1.0\n');
    await executable(badExecutable, 'not a compatible version\n');
    await writeFile(successfulMedia, 'success', 'utf8');
    await writeFile(failedMedia, 'failure', 'utf8');
    await writeFile(slowMedia, 'slow', 'utf8');

    const hasDisplay = Boolean(process.env.DISPLAY?.trim());
    const useXvfb = process.platform === 'linux' && !hasDisplay && existsSync('/usr/bin/xvfb-run');
    const useHeadless = process.platform === 'linux' && !hasDisplay && !useXvfb;
    const electronArguments = [
      ...(process.platform === 'linux'
        ? ['--no-sandbox', '--disable-gpu', ...(useHeadless ? ['--headless'] : [])]
        : []),
      resolve(desktopRoot, 'integration/utility-process-harness'),
      'launcher-injected-argument',
      resolve(desktopRoot, 'dist/worker/index.js'),
      goodExecutable,
      badExecutable,
      successfulMedia,
      failedMedia,
      slowMedia,
    ];
    const execution = spawnSync(
      useXvfb ? '/usr/bin/xvfb-run' : electron,
      [...(useXvfb ? ['-a', electron] : []), ...electronArguments],
      {
        cwd: desktopRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          CP5_HARNESS_DEBUG: '1',
          ELECTRON_DISABLE_GPU: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 45_000,
      },
    );
    const diagnostic = JSON.stringify({
      status: execution.status,
      signal: execution.signal,
      errorCode: (execution.error as NodeJS.ErrnoException | undefined)?.code,
      stderr: execution.stderr.length === 0 ? 'empty' : 'present',
      stderrPreview: sanitizedStderrPreview(execution.stderr, root),
      debugStages: execution.stderr
        .split(/\r?\n/u)
        .filter((line) => /^CP5_DEBUG:[a-z-]+$/u.test(line)),
    });
    expect(execution.stderr.includes(root)).toBe(false);
    expect(execution.error === undefined, diagnostic).toBe(true);
    expect(execution.status, diagnostic).toBe(0);
    const output = execution.stdout;
    const marker = output.split(/\r?\n/u).find((line) => line.startsWith('CP5_RESULT:'));
    expect(marker).toBeDefined();
    const result = JSON.parse(marker!.slice('CP5_RESULT:'.length)) as unknown;

    expect(result).toEqual({
      success: {
        status: 'succeeded',
        displayName: 'success.mov',
        versionLine: 'ffprobe version fake-1.0',
      },
      failure: { status: 'failed', code: 'MEDIA_UNSUPPORTED' },
      incompatible: { status: 'failed', code: 'FFPROBE_INCOMPATIBLE' },
      cancellation: { status: 'cancelled', accepted: true },
      shutdown: 'completed',
    });
    expect(output.includes(root)).toBe(false);
    expect(output.includes('absolutePath')).toBe(false);
    expect(output.includes('environment')).toBe(false);
  }, 60_000);
});
