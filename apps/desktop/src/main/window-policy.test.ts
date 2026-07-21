import type { WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import {
  createWindowOptions,
  installNavigationGuards,
  isAllowedNavigation,
} from './window-policy.js';

describe('secure window policy', () => {
  it('enables every required isolation control', () => {
    const options = createWindowOptions('/absolute/preload.cjs');

    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      preload: '/absolute/preload.cjs',
      sandbox: true,
      webSecurity: true,
    });
  });

  it('allows only a reload of the exact local file', () => {
    const local = 'file:///app/dist/renderer/index.html';

    expect(isAllowedNavigation(local, local)).toBe(true);
    expect(isAllowedNavigation(local, 'file:///app/dist/renderer/other.html')).toBe(false);
    expect(isAllowedNavigation(local, 'https://example.com')).toBe(false);
    expect(isAllowedNavigation('', local)).toBe(false);
    expect(isAllowedNavigation('not a url', 'not a url')).toBe(false);
  });

  it('denies popups and prevents unexpected navigation', () => {
    let openHandler: (() => { action: 'deny' }) | undefined;
    let navigationHandler:
      ((event: { preventDefault(): void }, targetUrl: string) => void) | undefined;
    const webContents = {
      getURL: () => 'file:///app/index.html',
      setWindowOpenHandler: (handler: () => { action: 'deny' }) => {
        openHandler = handler;
      },
      on: (_event: string, handler: typeof navigationHandler) => {
        navigationHandler = handler;
      },
    } as unknown as WebContents;
    installNavigationGuards(webContents);

    const preventDefault = vi.fn();
    expect(openHandler?.()).toEqual({ action: 'deny' });
    navigationHandler?.({ preventDefault }, 'https://example.com');
    expect(preventDefault).toHaveBeenCalledOnce();

    preventDefault.mockClear();
    navigationHandler?.({ preventDefault }, 'file:///app/index.html');
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
