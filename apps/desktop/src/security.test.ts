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

    expect(declaration).toContain('aiVideoAssembly: FoundationBridge');
    expect(declaration).not.toMatch(/NodeJS|process|require|Buffer|ipcRenderer/);
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
