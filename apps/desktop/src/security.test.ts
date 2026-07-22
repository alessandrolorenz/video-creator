import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const desktopRoot = join(import.meta.dirname, '..');

function source(path: string): string {
  return readFileSync(join(desktopRoot, path), 'utf8');
}

describe('desktop security structure', () => {
  it('uses a CommonJS preload and exposes only the named bridge', () => {
    const preload = source('src/preload/index.ts');
    const preloadBuild = source('vite.preload.config.ts');

    expect(preload).toContain("contextBridge.exposeInMainWorld('aiVideoAssembly'");
    expect(preload).not.toMatch(/readFile|shell|execute|process\.env|api.?key/i);
    expect(preloadBuild).toContain("formats: ['cjs']");
    expect(preloadBuild).toContain("fileName: () => 'index.cjs'");
  });

  it('never loads a remote renderer URL', () => {
    const main = source('src/main/index.ts');

    expect(main).toContain('.loadFile(');
    expect(main).not.toContain('.loadURL(');
    expect(main).not.toMatch(/https?:\/\//);
  });

  it('declares no Node global in the renderer', () => {
    const declaration = source('src/renderer/global.d.ts');

    expect(declaration).toContain('aiVideoAssembly: DesktopBridge');
    expect(declaration).not.toMatch(/NodeJS|process|require|Buffer|ipcRenderer/);
    expect(declaration).not.toMatch(/absolutePath|filesystem|command|environment|UtilityProcess/);
  });

  it('keeps the semantic preload surface free of raw IPC and privileged values', () => {
    const bridge = source('src/preload/bridge.ts');
    const declaration = source('src/renderer/global.d.ts');

    expect(bridge).toContain('INGEST_POLL_INTERVAL_MIN_MS');
    expect(`${bridge}\n${declaration}`).not.toMatch(
      /absolutePath|process\.env|UtilityProcess|child_process|readFile|execFile|spawn\(/,
    );
    expect(bridge).not.toMatch(/\bon\s*:\s*|addListener|channel:\s*string/);
  });

  it('sets a restrictive renderer content security policy', () => {
    const html = source('index.html');
    const rendererBuild = source('vite.config.ts');

    expect(html).toContain("default-src 'self'");
    expect(html).toContain("script-src 'self'");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("media-src 'none'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("frame-src 'none'");
    expect(rendererBuild).toContain("base: './'");
  });
});
