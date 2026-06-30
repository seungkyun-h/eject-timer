// Renders the live 3D character rig (all behaviors) to a PNG for visual verification.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('ignore-gpu-blocklist');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 840, height: 700, show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  win.loadFile(path.join(__dirname, process.env.TT_PAGE || 'char-test.html'));
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.TT_SHOT || '/tmp/char.png', img.toPNG());
      } catch (e) { console.error(e); }
      app.quit();
    }, 1800);
  });
});
