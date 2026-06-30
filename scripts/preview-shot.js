// Standalone Electron harness: render an arbitrary HTML file to a PNG and quit.
// Usage: TT_SHOT=/abs/out.png electron scripts/preview-shot.js /abs/page.html
const { app, BrowserWindow } = require('electron');
const fs = require('fs');

const pagePath = process.argv[process.argv.length - 1];
const out = process.env.TT_SHOT || '/tmp/preview.png';

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 520, height: 320, show: false,
    webPreferences: { offscreen: false },
  });
  win.loadFile(pagePath);
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(out, img.toPNG());
      } catch (e) { console.error(e); }
      app.quit();
    }, 700);
  });
});
