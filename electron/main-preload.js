// Bridge between the app window and the desktop side (only exists in the desktop app,
// not when the interface runs in a normal browser).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  getUpdate: () => ipcRenderer.invoke('update:get'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openDownload: () => ipcRenderer.invoke('update:open'),
  onUpdate: (callback) => ipcRenderer.on('update:status', (_event, status) => callback(status))
});
