import type { BrowserWindowConstructorOptions, WebContents } from 'electron';

export function createWindowOptions(preload: string): BrowserWindowConstructorOptions {
  return {
    width: 960,
    height: 640,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#f4f3ef',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload,
      sandbox: true,
      webSecurity: true,
    },
  };
}

export function isAllowedNavigation(currentUrl: string, targetUrl: string): boolean {
  try {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl);
    return current.protocol === 'file:' && target.href === current.href;
  } catch {
    return false;
  }
}

export function installNavigationGuards(webContents: WebContents): void {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedNavigation(webContents.getURL(), targetUrl)) event.preventDefault();
  });
}
