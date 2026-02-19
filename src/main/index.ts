/**
 * Electron main process entry point.
 *
 * Responsibilities:
 *   - Create BrowserWindow with strict security settings.
 *   - Register IPC handlers.
 *   - Enforce CSP via session headers.
 *   - Wire auto-update (stubbed for now — Task 1-5).
 */

import { app, BrowserWindow, session } from 'electron';
import * as path from 'path';
import {
  CONTENT_SECURITY_POLICY,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
} from '../shared/constants';
import { registerIpcHandlers, cleanupPdfium } from './ipc-handlers';

/** Keep a global reference to prevent GC. */
let mainWindow: BrowserWindow | null = null;

/**
 * Create the main application window with security best-practices.
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: 'PDF Editor',
    webPreferences: {
      // ── Security: disable direct Node access in renderer ──
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,

      // Preload exposes only typed IPC bridges
      preload: path.join(__dirname, '..', 'preload', 'index.js'),

      // Disable remote module (deprecated but explicit)
      // @ts-expect-error — enableRemoteModule not in latest types
      enableRemoteModule: false,

      // Disable web-security only in dev if needed (never in prod)
      webSecurity: true,

      // Prevent navigation and new-window creation
      navigateOnDragDrop: false,
    },
  });

  // Load renderer HTML
  const rendererHtml = path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html');
  mainWindow.loadFile(rendererHtml);

  // Open DevTools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'right' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Enforce CSP via response headers on the default session.
 */
function enforceCSP(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
      },
    });
  });
}

/**
 * Prevent navigation and new-window creation (defense in depth).
 */
function lockdownNavigation(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (event, _url) => {
    event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
}

// ── App lifecycle ────────────────────────────────────────────────────

app.whenReady().then(() => {
  enforceCSP();
  registerIpcHandlers();
  createWindow();

  if (mainWindow) {
    lockdownNavigation(mainWindow);
  }

  app.on('activate', () => {
    // macOS: re-create window when dock icon clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (mainWindow) {
        lockdownNavigation(mainWindow);
      }
    }
  });
});

app.on('window-all-closed', () => {
  cleanupPdfium();
  // macOS convention: stay alive until explicit quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ── Security hardening ──────────────────────────────────────────────

// Disable hardware acceleration if issues arise (uncomment if needed):
// app.disableHardwareAcceleration();

// Prevent multiple instances (disabled in test mode for E2E parallel launches)
if (process.env.NODE_ENV !== 'test') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}
