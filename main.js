const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let widgetWin = null;
let petWin = null;
let tray = null;
let isQuitting = false;
let settings = null;

// ---------------------------------------------------------------------------
// settings store (canonical state lives in main process, persisted to disk)
// ---------------------------------------------------------------------------
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = { shift: 'A', char: 'hamster', onTop: true, pet: false, calm: false, realistic: false, display: null, petCount: 1, overtime: { date: '', minutes: 0 } };
const MAX_PETS = 3;

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function loadSettings() {
  let s = { ...DEFAULTS };
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    s = { ...s, ...raw, overtime: { ...DEFAULTS.overtime, ...(raw.overtime || {}) } };
  } catch { /* first run / no file */ }
  // overtime resets every day
  if (!s.overtime || s.overtime.date !== todayStr()) {
    s.overtime = { date: todayStr(), minutes: 0 };
  }
  return s;
}

function saveSettings() {
  try { fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2)); } catch { /* ignore */ }
}

function broadcast() {
  for (const w of [widgetWin, petWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('state-changed', settings);
  }
}

// Single entry point for every state change: merge -> persist -> apply -> broadcast.
function updateState(partial) {
  const prevPet = settings.pet;
  const incomingOt = partial.overtime;
  settings = { ...settings, ...partial };
  if (incomingOt) settings.overtime = { date: todayStr(), minutes: Math.max(0, incomingOt.minutes ?? 0) };
  if (partial.petCount !== undefined) settings.petCount = Math.max(1, Math.min(MAX_PETS, partial.petCount | 0));
  saveSettings();

  if (partial.onTop !== undefined && widgetWin && !widgetWin.isDestroyed()) {
    widgetWin.setAlwaysOnTop(settings.onTop, 'floating');
  }
  if (partial.display !== undefined) { fitPetToDisplays(); rebuildTrayMenu(); }
  if (partial.petCount !== undefined) rebuildTrayMenu();
  if (settings.pet !== prevPet) applyPet();
  broadcast();
  return settings;
}

// ---------------------------------------------------------------------------
// windows
// ---------------------------------------------------------------------------
function createWidget() {
  // Always open on the primary display, upper-center, so it's easy to find.
  const W = 320, H = 472;
  const wa = screen.getPrimaryDisplay().workArea;
  const wx = Math.round(wa.x + (wa.width - W) / 2);
  const wy = Math.round(wa.y + Math.max(24, (wa.height - H) / 3));
  widgetWin = new BrowserWindow({
    width: W,
    height: H,
    x: wx,
    y: wy,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    alwaysOnTop: settings.onTop,
    title: '퇴근 타이머',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  widgetWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.env.TT_SMOKE) {
    widgetWin.webContents.on('console-message', (e, level, message) => console.log('[widget]', message ?? (e && e.message)));
    console.log('[widget-bounds]', JSON.stringify(widgetWin.getBounds()));
  }
  if (settings.onTop) widgetWin.setAlwaysOnTop(true, 'floating');
  widgetWin.once('ready-to-show', () => { widgetWin.show(); widgetWin.focus(); });
  // Closing hides to the tray instead of quitting.
  widgetWin.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); widgetWin.hide(); }
  });
}

// The "roams-on-the-desktop" pet: a fullscreen, transparent, click-through,
// always-on-top overlay that covers the whole display. Because it ignores
// mouse events, your clicks pass through to whatever is behind it — so the
// character appears to run around freely on the desktop with no visible window.
// The pet lives on ONE chosen display (settings.display = that display's id;
// null = primary). If the chosen monitor is unplugged, we fall back to primary.
function chosenDisplay() {
  if (settings && settings.display != null) {
    const d = screen.getAllDisplays().find((x) => x.id === settings.display);
    if (d) return d;
  }
  return screen.getPrimaryDisplay();
}

// Cover the chosen display's work area (above the Dock), where the pet roams.
function petAreaBounds() {
  const wa = chosenDisplay().workArea;
  return { x: wa.x, y: wa.y, width: wa.width, height: wa.height };
}

function fitPetToDisplays() {
  if (petWin && !petWin.isDestroyed()) petWin.setBounds(petAreaBounds());
}

function createPet() {
  if (petWin && !petWin.isDestroyed()) { petWin.show(); return; }
  const area = petAreaBounds();
  petWin = new BrowserWindow({
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  petWin.setIgnoreMouseEvents(true, { forward: true }); // <- click-through
  petWin.setAlwaysOnTop(true, 'screen-saver');
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWin.loadFile(path.join(__dirname, 'renderer', 'pet.html'));
  if (process.env.TT_SMOKE) {
    petWin.webContents.on('console-message', (e, level, message) => console.log('[pet]', message ?? (e && e.message)));
    console.log('[pet-bounds]', JSON.stringify(petWin.getBounds()));
  }
  if (process.env.TT_SHOT_PET) {
    petWin.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try { fs.writeFileSync(process.env.TT_SHOT_PET, (await petWin.webContents.capturePage()).toPNG()); } catch (e) { console.error(e); }
        isQuitting = true; app.quit();
      }, Number(process.env.TT_SHOT_DELAY) || 1600);
    });
  }
  petWin.on('closed', () => { petWin = null; });
}

function destroyPet() {
  if (petWin && !petWin.isDestroyed()) petWin.close();
  petWin = null;
}

function applyPet() {
  if (settings.pet) createPet(); else destroyPet();
  rebuildTrayMenu();
}

function toggleWidget() {
  if (!widgetWin || widgetWin.isDestroyed()) { createWidget(); return; }
  if (widgetWin.isVisible()) widgetWin.hide();
  else { widgetWin.show(); widgetWin.focus(); }
}

// ---------------------------------------------------------------------------
// tray (macOS menu bar)
// ---------------------------------------------------------------------------
// One radio entry per monitor, so the pet can be moved to any display.
function displayMenuItems() {
  const primaryId = screen.getPrimaryDisplay().id;
  const selId = chosenDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    label: `모니터 ${i + 1} — ${d.size.width}×${d.size.height}${d.id === primaryId ? ' (주)' : ''}`,
    type: 'radio',
    checked: d.id === selId,
    click: () => updateState({ display: d.id }),
  }));
}

function rebuildTrayMenu() {
  if (!tray) return;
  const multiDisplay = screen.getAllDisplays().length > 1;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '창 보이기 / 숨기기', click: toggleWidget },
    {
      label: settings.pet ? '🐾 데스크톱 펫 끄기' : '🐾 데스크톱 펫 켜기',
      click: () => updateState({ pet: !settings.pet }),
    },
    ...(settings.pet ? [{
      label: '🐹 마리 수',
      submenu: Array.from({ length: MAX_PETS }, (_, k) => k + 1).map((n) => ({
        label: `${n}마리`,
        type: 'radio',
        checked: (settings.petCount || 1) === n,
        click: () => updateState({ petCount: n }),
      })),
    }] : []),
    ...(multiDisplay ? [{ label: '🖥 펫 위치 모니터', submenu: displayMenuItems() }] : []),
    {
      label: settings.calm ? '🧘 가만히 모드 끄기' : '🧘 가만히 모드 켜기',
      click: () => updateState({ calm: !settings.calm }),
    },
    {
      label: settings.realistic ? '📷 실사 모드 끄기 (3D로)' : '📷 실사 모드 켜기',
      click: () => updateState({ realistic: !settings.realistic }),
    },
    { type: 'separator' },
    { label: '종료', click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle(' 🐹 --:--');
  tray.setToolTip('퇴근 타이머');
  rebuildTrayMenu();
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('get-state', () => settings);
ipcMain.handle('set-state', (_e, partial) => updateState(partial || {}));
ipcMain.on('tray-update', (_e, title) => { if (tray) tray.setTitle(title); });
ipcMain.on('notify', (_e, payload) => {
  if (Notification.isSupported()) {
    new Notification({ title: payload.title, body: payload.body, silent: false }).show();
  }
});
ipcMain.on('win-hide', () => { if (widgetWin) widgetWin.hide(); });
ipcMain.on('toggle-pet', () => updateState({ pet: !settings.pet }));

// Pet hover toggles OS click-through so the character can be grabbed/clicked
// while the rest of the transparent overlay stays click-through.
ipcMain.on('pet-interactive', (_e, interactive) => {
  if (petWin && !petWin.isDestroyed()) {
    petWin.setIgnoreMouseEvents(!interactive, { forward: true });
  }
});

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  settings = loadSettings();
  if (process.argv.includes('--pet')) settings.pet = true;
  saveSettings();

  createWidget();
  createTray();
  applyPet();

  // keep the pet on its chosen display as monitors change; refresh the picker too
  const onDisplaysChanged = () => { fitPetToDisplays(); rebuildTrayMenu(); };
  screen.on('display-metrics-changed', onDisplaysChanged);
  screen.on('display-added', onDisplaysChanged);
  screen.on('display-removed', onDisplaysChanged);

  app.on('activate', () => {
    if (!widgetWin || widgetWin.isDestroyed()) createWidget();
    else widgetWin.show();
  });

  // CI/smoke test: boot, then quit a few seconds later so it doesn't hang.
  if (process.env.TT_SMOKE) {
    setTimeout(() => { isQuitting = true; app.quit(); }, 3500);
  }

  // Screenshot harness: render the widget, save a PNG, quit. (visual verification)
  if (process.env.TT_SHOT && widgetWin) {
    widgetWin.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const img = await widgetWin.webContents.capturePage();
          fs.writeFileSync(process.env.TT_SHOT, img.toPNG());
        } catch (e) { console.error('shot failed:', e); }
        isQuitting = true;
        app.quit();
      }, Number(process.env.TT_SHOT_DELAY) || 1500);
    });
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { isQuitting = true; });
