import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge, PullProgress } from '../src/desktop/bridge';

/** The only door between the game and the computer. Each call goes to one fixed handler in the main process. */

/** Electron wraps errors as "Error invoking remote method 'x': Error: message". Show only the message. */
const message = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

const version = process.argv.find((a) => a.startsWith('--hoops-version='))?.slice('--hoops-version='.length) ?? '0.0.0';

const bridge: DesktopBridge = {
  isDesktop: true,
  appVersion: version,
  status: (sel) => ipcRenderer.invoke('desktop:status', sel).catch((e) => Promise.reject(new Error(message(e)))),
  startEngine: (sel) => ipcRenderer.invoke('desktop:start', sel).catch((e) => Promise.reject(new Error(message(e)))),
  pullModel: (sel, onProgress) =>
    new Promise<void>((resolve, reject) => {
      const handler = (_e: unknown, p: PullProgress) => onProgress(p);
      ipcRenderer.on('desktop:pull-progress', handler);
      ipcRenderer
        .invoke('desktop:pull', sel)
        .then(() => resolve(), (e) => reject(new Error(message(e))))
        .finally(() => ipcRenderer.removeListener('desktop:pull-progress', handler));
    }),
  cancelPull: () => ipcRenderer.invoke('desktop:cancel-pull'),
  warmUp: async (sel) => {
    try {
      return await ipcRenderer.invoke('desktop:warm', sel);
    } catch {
      return false;
    }
  },
  openOllamaDownload: () => ipcRenderer.invoke('desktop:open-download'),
};

contextBridge.exposeInMainWorld('hoopsDesktop', bridge);
