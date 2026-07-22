import { contextBridge, ipcRenderer } from 'electron';

import { createDesktopBridge, type IpcInvoke } from './bridge.js';

const invoke: IpcInvoke = (channel, payload) =>
  ipcRenderer.invoke(channel, payload) as ReturnType<IpcInvoke>;

const bridge = createDesktopBridge(invoke);
contextBridge.exposeInMainWorld('aiVideoAssembly', bridge);
