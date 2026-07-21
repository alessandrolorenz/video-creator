import { app, BrowserWindow, ipcMain } from 'electron';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { registerFoundationStatusHandler } from './foundation-status-handler.js';
import { createWindowOptions, installNavigationGuards } from './window-policy.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const preloadPath = resolve(currentDirectory, '../preload/index.cjs');
const rendererPath = resolve(currentDirectory, '../renderer/index.html');

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow(createWindowOptions(preloadPath));
  installNavigationGuards(window.webContents);
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
