// Bridge between the earbud picker window and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
  onPorts: (callback) => ipcRenderer.on('picker:ports', (_event, list) => callback(list)),
  choose: (portId) => ipcRenderer.send('picker:choose', portId),
  cancel: () => ipcRenderer.send('picker:cancel')
});
