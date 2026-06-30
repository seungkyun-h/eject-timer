const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 720, height: 700, show: true, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  win.loadFile(process.argv[process.argv.length - 1]);
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      require('fs').writeFileSync(process.env.TT_SHOT || '/tmp/vf.png', (await win.webContents.capturePage()).toPNG());
      app.quit();
    }, Number(process.env.TT_SHOT_DELAY) || 2500);
  });
});
