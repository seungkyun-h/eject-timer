const { contextBridge, ipcRenderer } = require('electron');

// Safe bridge between the (sandboxed) renderer and the main process.
contextBridge.exposeInMainWorld('timerAPI', {
  getState: () => ipcRenderer.invoke('get-state'),
  setState: (partial) => ipcRenderer.invoke('set-state', partial),
  onStateChanged: (cb) => ipcRenderer.on('state-changed', (_e, s) => cb(s)),
  updateTray: (title) => ipcRenderer.send('tray-update', title),
  notify: (payload) => ipcRenderer.send('notify', payload),
  hideWindow: () => ipcRenderer.send('win-hide'),
  togglePet: () => ipcRenderer.send('toggle-pet'),
  petInteractive: (v) => ipcRenderer.send('pet-interactive', v),
});
