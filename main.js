// Nothing X — desktop app (Electron main process)
//
// Wraps the web app in web/dist in a real desktop window and connects to the
// earbuds through Web Serial over Bluetooth, the same way Chrome does.
//
// Run from source:   npm start            (builds the web app, then opens the window)
// Live dev server:   set EAR_DEV_URL=http://localhost:5173 && npx electron .
// Build installer:   npm run dist:win     (or dist:mac on a Mac)

const { app, BrowserWindow, ipcMain, nativeTheme, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const DEV_URL = process.env.EAR_DEV_URL || '';
const LIKELY_EARBUDS = /nothing|ear|cmf|buds/i;

let mainWindow = null;
let picker = null; // { win, callback, ports: Map }

// ---------- One window only: opening the app again focuses the existing one ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

// Dark title bar and window chrome on Windows/macOS
nativeTheme.themeSource = 'dark';

function log(msg) {
  console.log(msg);
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'debug_log.txt'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* logging must never crash the app */ }
}

function portLabel(p) {
  return p.displayName || p.portName || 'Unknown device';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 420,
    minHeight: 600,
    title: 'Nothing X',
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'resources', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (DEV_URL) mainWindow.loadURL(DEV_URL);
  else mainWindow.loadFile(path.join(__dirname, 'web', 'dist', 'index.html'));

  // Links to websites open in the normal browser, never inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const internal = url.startsWith('file://') || (DEV_URL && url.startsWith(DEV_URL));
    if (!internal) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  // F12 or Ctrl+Shift+I opens developer tools (handy for debugging the connection)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const devtools = input.type === 'keyDown' &&
      (input.key === 'F12' || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i'));
    if (devtools) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  setupSerial(mainWindow.webContents.session);
}

// ---------- Bluetooth serial (Web Serial) ----------
function setupSerial(ses) {
  ses.setPermissionCheckHandler((_wc, permission) => ['serial', 'bluetooth', 'notifications'].includes(permission));
  ses.setDevicePermissionHandler((details) => details.deviceType === 'serial' || details.deviceType === 'bluetooth');

  // The web app called navigator.serial.requestPort(): choose a port for it
  ses.on('select-serial-port', (event, portList, _wc, callback) => {
    event.preventDefault();
    log(`select-serial-port: ${portList.length} port(s)`);
    portList.forEach(p => log(`  - ${portLabel(p)} [${p.portId}]`));

    // The app only asks for Bluetooth serial ports, so a single match (or one
    // that is clearly a Nothing/CMF device) can be connected straight away.
    const named = portList.filter(p => LIKELY_EARBUDS.test(portLabel(p)));
    if (named.length === 1 || portList.length === 1) {
      const chosen = named[0] || portList[0];
      log(`Auto-selected ${portLabel(chosen)}`);
      callback(chosen.portId);
      return;
    }
    openPicker(portList, callback);
  });

  ses.on('serial-port-added', (_event, port) => {
    if (!picker) return;
    picker.ports.set(port.portId, port);
    sendPorts();
  });

  ses.on('serial-port-removed', (_event, port) => {
    if (!picker) return;
    picker.ports.delete(port.portId);
    sendPorts();
  });
}

function sendPorts() {
  if (!picker || picker.win.isDestroyed()) return;
  const list = [...picker.ports.values()].map(p => ({
    id: p.portId,
    label: portLabel(p),
    detail: p.portName && p.portName !== p.displayName ? p.portName : '',
    likely: LIKELY_EARBUDS.test(portLabel(p))
  })).sort((a, b) => Number(b.likely) - Number(a.likely));
  picker.win.webContents.send('picker:ports', list);
}

function finishPicker(portId) {
  if (!picker) return;
  const { win, callback } = picker;
  picker = null;
  callback(portId || ''); // '' cancels the request in the web app
  if (!win.isDestroyed()) win.close();
}

function openPicker(portList, callback) {
  if (picker) finishPicker(''); // only one request at a time

  const win = new BrowserWindow({
    parent: mainWindow,
    modal: true,
    width: 400,
    height: 480,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Choose your earbuds',
    backgroundColor: '#0a0a0a',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'electron', 'picker-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  picker = { win, callback, ports: new Map(portList.map(p => [p.portId, p])) };

  win.loadFile(path.join(__dirname, 'electron', 'picker.html'));
  win.once('ready-to-show', () => { win.show(); sendPorts(); });
  win.on('closed', () => { if (picker && picker.win === win) finishPicker(''); });
}

ipcMain.on('picker:choose', (_event, portId) => {
  log(`Picker chose ${portId}`);
  finishPicker(portId);
});
ipcMain.on('picker:cancel', () => finishPicker(''));

// ---------- App lifecycle ----------
app.whenReady().then(() => {
  // No File/Edit menu on Windows; macOS keeps its standard app menu (Cmd+Q, copy/paste)
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
