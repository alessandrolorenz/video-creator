import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const workerRoot = import.meta.dirname;

function source(path: string): string {
  return readFileSync(join(workerRoot, path), 'utf8');
}

describe('utility worker security structure', () => {
  it('keeps process spawning in one owned adapter with a fixed no-shell call', () => {
    const adapter = source('media-probe/node-spawn-adapter.ts');
    const runner = source('media-probe/ffprobe-runner.ts');

    expect(adapter).toContain("from 'node:child_process'");
    expect(adapter).toContain('shell: options.shell');
    expect(runner).toContain("arguments: ['-version']");
    expect(runner).toContain('FFPROBE_PROBE_ARGUMENTS');
    expect(runner).not.toMatch(/execFile|\bexec\(|shell:\s*true/);
  });

  it('never reads environment or imports renderer/preload/application code', () => {
    const files = [
      source('index.ts'),
      source('media-probe/protocol.ts'),
      source('media-probe/bounded-process.ts'),
      source('media-probe/ffprobe-runner.ts'),
      source('media-probe/media-probe-worker.ts'),
      source('media-probe/node-spawn-adapter.ts'),
    ];
    const combined = files.join('\n');

    expect(combined).not.toMatch(/process\.env|AI_VIDEO_ASSEMBLY_FFPROBE_PATH/);
    expect(combined).not.toMatch(/from ['"].*(?:renderer|preload|src\/main)/);
    expect(combined).not.toMatch(/rawOutput|stderrMessage|environment|commandLine/);
  });

  it('exposes only typed parent-port messages and no logging surface', () => {
    const entry = source('index.ts');
    expect(entry).toContain('process.parentPort');
    expect(entry).toContain('parentPort.postMessage(value)');
    expect(entry).not.toMatch(/console\.|stdout\.write|stderr\.write/);
  });
});
