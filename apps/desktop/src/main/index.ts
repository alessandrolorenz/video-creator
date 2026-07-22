import { app, BrowserWindow, ipcMain, utilityProcess } from 'electron';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { registerFoundationStatusHandler } from './foundation-status-handler.js';
import { createDesktopIngestRuntimeV1 } from './ingest-runtime.js';
import { createWindowOptions, installNavigationGuards } from './window-policy.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const preloadPath = resolve(currentDirectory, '../preload/index.cjs');
const rendererPath = resolve(currentDirectory, '../renderer/index.html');
const workerPath = resolve(currentDirectory, '../worker/index.js');

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow(createWindowOptions(preloadPath));
  const runtime = createDesktopIngestRuntimeV1({
    ipcMain,
    windowLifecycle: window,
    appLifecycle: app,
    workerPath,
    utilityFork: (modulePath, args, options) => utilityProcess.fork(modulePath, args, options),
    parentWindowFor(event) {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (senderWindow !== window) throw new Error('Unexpected ingest IPC sender.');
      return window;
    },
  });
  installNavigationGuards(window.webContents);
  window.once('closed', () => runtime.dispose());
  window.once('ready-to-show', () => window.show());
  void window.loadFile(rendererPath).catch(() => app.quit());
  return window;
}

registerFoundationStatusHandler(ipcMain);

void app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
