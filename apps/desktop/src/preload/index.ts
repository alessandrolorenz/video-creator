import { contextBridge, ipcRenderer } from 'electron';

import { createFoundationBridge, type IpcInvoke } from './bridge.js';

const invoke: IpcInvoke = (channel, payload) =>
  ipcRenderer.invoke(channel, payload) as ReturnType<IpcInvoke>;

const bridge = createFoundationBridge(invoke);
contextBridge.exposeInMainWorld('aiVideoAssembly', bridge);
