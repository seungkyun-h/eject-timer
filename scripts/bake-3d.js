// Electron harness that loads the 3D bake page, waits for it to write the PNGs,
// then quits.  Usage: electron scripts/bake-3d.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('ignore-gpu-blocklist');

const ASSETS = path.join(__dirname, '..', 'renderer', 'assets');
const done = path.join(ASSETS, '.bake-done');
const errf = path.join(ASSETS, '.bake-error');

app.whenReady().then(() => {
  for (const f of [done, errf]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }

  const win = new BrowserWindow({
    width: 800, height: 800, show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  win.loadFile(path.join(__dirname, 'bake.html'));

  const start = Date.now();
  const timer = setInterval(() => {
    if (fs.existsSync(done)) {
      clearInterval(timer);
      console.log('bake: done');
      app.quit();
    } else if (fs.existsSync(errf)) {
      clearInterval(timer);
      console.error('bake error:\n' + fs.readFileSync(errf, 'utf8'));
      app.quit();
    } else if (Date.now() - start > 20000) {
      clearInterval(timer);
      console.error('bake: timeout');
      app.quit();
    }
  }, 300);
});
