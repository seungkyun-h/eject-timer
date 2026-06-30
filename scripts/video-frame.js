const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 480, height: 854, show: true, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  win.loadFile(process.argv[process.argv.length - 1]);
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      require('fs').writeFileSync(process.env.TT_SHOT || '/tmp/vf.png', (await win.webContents.capturePage()).toPNG());
      app.quit();
    }, 3000);
  });
});
