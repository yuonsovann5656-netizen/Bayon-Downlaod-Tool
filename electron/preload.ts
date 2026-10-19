import { contextBridge, ipcRenderer } from 'electron';
const api = {
  settings: { get: () => ipcRenderer.invoke('settings:get'), set: (value: unknown) => ipcRenderer.invoke('settings:set', value) },
  files: { pickFolder: () => ipcRenderer.invoke('files:pick-folder'), pickMedia: () => ipcRenderer.invoke('files:pick-media'), open: (path: string) => ipcRenderer.invoke('files:open', path), reveal: (path: string) => ipcRenderer.invoke('files:reveal', path) },
  downloads: { history: () => ipcRenderer.invoke('downloads:history'), start: (value: unknown) => ipcRenderer.invoke('downloads:start', value), cancel: (id: string) => ipcRenderer.invoke('downloads:cancel', id), remove: (id: string) => ipcRenderer.invoke('downloads:remove', id) },
  media: { inspect: (path: string) => ipcRenderer.invoke('media:inspect', path), convert: (value: unknown) => ipcRenderer.invoke('media:convert', value), cancel: (id: string) => ipcRenderer.invoke('media:cancel', id) },
  app: { version: () => ipcRenderer.invoke('app:version'), notify: (title: string, body: string) => ipcRenderer.invoke('app:notify', title, body), updateCheck: () => ipcRenderer.invoke('app:update-check'), installUpdate: () => ipcRenderer.invoke('app:update-install') },
  on: (channel: string, callback: (data: any) => void) => { const allowed = ['downloads:started','downloads:progress','downloads:complete','downloads:error','downloads:cancelled','media:progress','media:complete','media:error','updates:state']; if (!allowed.includes(channel)) return () => {}; const listener = (_: Electron.IpcRendererEvent, data: unknown) => callback(data); ipcRenderer.on(channel, listener); return () => ipcRenderer.removeListener(channel, listener); }
};
contextBridge.exposeInMainWorld('bayon', api);
