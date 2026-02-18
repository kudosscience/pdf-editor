/**
 * Main-process IPC handlers.
 *
 * Every handler is registered via ipcMain.handle (invoke/handle pattern)
 * and validates the channel against the shared allow-list.
 */

import { ipcMain, dialog, app, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import {
  IPC_CHANNELS,
  isAllowedChannel,
  type FileOpenResult,
  type FileSavePayload,
} from '../shared/ipc-schema';
import { PDF_FILE_FILTERS, MAX_RECENT_FILES } from '../shared/constants';

/** In-memory recent file list (persisted to disk in a later task). */
let recentFiles: string[] = [];

/**
 * Register all IPC handlers.  Called once from main/index.ts.
 */
export function registerIpcHandlers(): void {
  // ── File operations ─────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.FILE_OPEN, async (_event): Promise<FileOpenResult | null> => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: PDF_FILE_FILTERS,
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const data = await fs.readFile(filePath);
    addRecentFile(filePath);

    return { filePath, data: new Uint8Array(data) };
  });

  ipcMain.handle(IPC_CHANNELS.FILE_SAVE, async (_event, payload: FileSavePayload): Promise<boolean> => {
    try {
      await fs.writeFile(payload.filePath, Buffer.from(payload.data));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.FILE_SAVE_AS, async (_event, data: Uint8Array): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;

    const result = await dialog.showSaveDialog(win, {
      filters: PDF_FILE_FILTERS,
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    await fs.writeFile(result.filePath, Buffer.from(data));
    addRecentFile(result.filePath);
    return result.filePath;
  });

  ipcMain.handle(IPC_CHANNELS.FILE_GET_RECENT, async (): Promise<string[]> => {
    return recentFiles;
  });

  // ── App lifecycle ───────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, async (): Promise<string> => {
    return app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.APP_QUIT, async (): Promise<void> => {
    app.quit();
  });

  // ── Auto-update stubs (wired in Task 1-5) ──────────────────────

  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async (): Promise<void> => {
    // TODO: Task 1-5 — trigger autoUpdater.checkForUpdates()
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async (): Promise<void> => {
    // TODO: Task 1-5 — trigger autoUpdater.downloadUpdate()
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, async (): Promise<void> => {
    // TODO: Task 1-5 — trigger autoUpdater.quitAndInstall()
  });

  // ── Catch-all: reject unknown channels ─────────────────────────
  ipcMain.on('message', (event, channel: string) => {
    if (!isAllowedChannel(channel)) {
      console.warn(`[IPC] Rejected unknown channel: ${channel}`);
      event.returnValue = null;
    }
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

function addRecentFile(filePath: string): void {
  recentFiles = [filePath, ...recentFiles.filter((f) => f !== filePath)].slice(
    0,
    MAX_RECENT_FILES,
  );
}
