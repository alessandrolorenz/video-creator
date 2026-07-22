import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const mainRoot = import.meta.dirname;

function source(path: string): string {
  return readFileSync(join(mainRoot, path), 'utf8');
}

describe('CP4 main-owned security structure', () => {
  it('reads the development ffprobe environment key only in main configuration', () => {
    const configuration = source('ffprobe-configuration.ts');
    const otherSources = [
      source('file-import.ts'),
      source('transcript-file-reader.ts'),
      source('media-probe-client.ts'),
      source('ingest-controller.ts'),
    ].join('\n');

    expect(configuration).toContain('process.env.AI_VIDEO_ASSEMBLY_FFPROBE_PATH');
    expect(otherSources).not.toMatch(/process\.env|AI_VIDEO_ASSEMBLY_FFPROBE_PATH/);
  });

  it('does not register IPC, alter preload, or expose a generic command/filesystem bridge', () => {
    const combined = [
      source('ffprobe-configuration.ts'),
      source('file-import.ts'),
      source('transcript-file-reader.ts'),
      source('media-probe-client.ts'),
      source('ingest-controller.ts'),
    ].join('\n');

    expect(combined).not.toMatch(/ipcMain|ipcRenderer|contextBridge|exposeInMainWorld/);
    expect(combined).not.toMatch(/shell:\s*true|execFile|\bexec\(/);
  });

  it('keeps paths in privileged file/source contracts and out of ingest snapshots', () => {
    const controller = source('ingest-controller.ts');
    const snapshotDeclaration = controller.slice(
      controller.indexOf('export interface IngestSnapshotV1'),
      controller.indexOf('export type StartIngestOperationResultV1'),
    );
    expect(controller).toContain('PrivilegedSelectedFileV1');
    expect(snapshotDeclaration).not.toContain('absolutePath');
  });
});
