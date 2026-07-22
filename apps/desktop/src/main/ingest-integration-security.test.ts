import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const desktopRoot = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(desktopRoot, '../..');

function desktopSource(path: string): string {
  return readFileSync(resolve(desktopRoot, path), 'utf8');
}

function repositorySource(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
}

describe('CP5 integration security structure', () => {
  it('keeps renderer and preload declarations path/process/handle free', () => {
    const shared = desktopSource('src/shared/ingest-ipc.ts');
    const preload = desktopSource('src/preload/bridge.ts');
    const rendererDeclaration = desktopSource('src/renderer/global.d.ts');
    const surface = `${shared}\n${preload}\n${rendererDeclaration}`;

    expect(surface).not.toMatch(
      /absolutePath|process\.env|UtilityProcess|ChildProcess|filesystem handle|command arguments|stderr|stdout|\bpid\b/,
    );
    expect(rendererDeclaration).toContain('aiVideoAssembly: DesktopBridge');
    expect(preload).not.toMatch(/ipcRenderer|contextBridge|addListener|send\(/);
  });

  it('wires one resolved worker artifact and verifies the exact IPC sender', () => {
    const main = desktopSource('src/main/index.ts');

    expect(main).toContain("resolve(currentDirectory, '../worker/index.js')");
    expect(main).toContain('createDesktopIngestRuntimeV1');
    expect(main).toContain('utilityProcess.fork(modulePath, args, options)');
    expect(main).toContain('BrowserWindow.fromWebContents(event.sender)');
    expect(main).toContain('senderWindow !== window');
    expect(main).not.toMatch(/execFile|spawn\(|shell:\s*true/);
  });

  it('keeps the utility child private and launches it without inherited stdio', () => {
    const adapter = desktopSource('src/main/utility-process-adapter.ts');

    expect(adapter).toContain("stdio: 'ignore'");
    expect(adapter).toContain("serviceName: 'AI Video Assembly Media Probe'");
    expect(adapter).not.toMatch(/\.pid|\.stdout|\.stderr|process\.env/);
    expect(adapter).not.toMatch(/export.*ElectronUtilityChildV1.*child/);
  });

  it('uses source exports for development/types and compiled exports for runtime', () => {
    for (const workspace of ['domain', 'media', 'transcript']) {
      const manifest = JSON.parse(repositorySource(`packages/${workspace}/package.json`)) as Record<
        string,
        unknown
      >;
      expect(manifest.exports).toEqual({
        '.': {
          development: './src/index.ts',
          types: './src/index.ts',
          default: './dist/index.js',
        },
      });
    }
  });

  it('uses only temporary text fixtures and never invokes a real ffprobe in integration', () => {
    const integrationTest = desktopSource('src/main/utility-process.integration.test.ts');
    const harness = desktopSource('integration/utility-process-harness/main.mjs');

    expect(integrationTest).toContain('mkdtemp');
    expect(integrationTest).toContain("writeFile(successfulMedia, 'success', 'utf8')");
    expect(integrationTest).not.toMatch(/download|curl|https?:|\.mp4['"]/);
    expect(harness).not.toMatch(/child_process|execFile|spawn\(|shell/);
  });
});
