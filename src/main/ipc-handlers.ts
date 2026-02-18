/**
 * Main-process IPC handlers.
 *
 * Every handler is registered via ipcMain.handle (invoke/handle pattern)
 * and validates the channel against the shared allow-list.
 */

import { ipcMain, dialog, app, BrowserWindow } from 'electron';
import * as fs from 'node:fs/promises';
import {
  IPC_CHANNELS,
  isAllowedChannel,
  type FileOpenResult,
  type FileSavePayload,
  type PdfOpenPayload,
  type PdfOpenResult,
  type PdfRenderPagePayload,
  type PdfRenderResult,
  type PdfListObjectsPayload,
  type PageObject,
  type PdfEditTextPayload,
  type PdfReplaceImagePayload,
  type PdfSavePayload,
  type PdfSaveResult,
} from '../shared/ipc-schema';
import {
  PDF_FILE_FILTERS,
  MAX_RECENT_FILES,
  MAX_BITMAP_CACHE_BYTES,
  RENDER_CONCURRENCY_LIMIT,
} from '../shared/constants';
import { PdfiumEngine } from './pdfium';

/** In-memory recent file list (persisted to disk in a later task). */
let recentFiles: string[] = [];

/** Singleton PDFium engine instance. */
const pdfiumEngine = new PdfiumEngine();

// ── LRU Bitmap Cache ────────────────────────────────────────────────

interface CacheEntry {
  key: string;
  image: Uint8Array;
  width: number;
  height: number;
}

/**
 * Simple LRU cache for rendered page bitmaps.
 * Bounded by total byte size (MAX_BITMAP_CACHE_BYTES).
 */
class LruBitmapCache {
  private readonly entries = new Map<string, CacheEntry>();
  private currentBytes = 0;

  static makeKey(docId: string, pageIndex: number, scale: number): string {
    return `${docId}:${pageIndex}:${scale}`;
  }

  get(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key);
    if (entry) {
      // Move to end (most-recently used)
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    return entry;
  }

  put(entry: CacheEntry): void {
    // Remove existing entry with same key if present
    const existing = this.entries.get(entry.key);
    if (existing) {
      this.currentBytes -= existing.image.byteLength;
      this.entries.delete(entry.key);
    }

    // Evict LRU entries until there is room
    while (this.currentBytes + entry.image.byteLength > MAX_BITMAP_CACHE_BYTES && this.entries.size > 0) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        const evicted = this.entries.get(oldest);
        if (evicted) this.currentBytes -= evicted.image.byteLength;
        this.entries.delete(oldest);
      }
    }

    this.entries.set(entry.key, entry);
    this.currentBytes += entry.image.byteLength;
  }

  /** Invalidate all cached pages for a given document. */
  invalidateDoc(docId: string): void {
    for (const [key, entry] of this.entries.entries()) {
      if (key.startsWith(docId + ':')) {
        this.currentBytes -= entry.image.byteLength;
        this.entries.delete(key);
      }
    }
  }

  /** Invalidate a specific page for a given document (all scales). */
  invalidatePage(docId: string, pageIndex: number): void {
    const prefix = `${docId}:${pageIndex}:`;
    for (const [key, entry] of this.entries.entries()) {
      if (key.startsWith(prefix)) {
        this.currentBytes -= entry.image.byteLength;
        this.entries.delete(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
    this.currentBytes = 0;
  }
}

const bitmapCache = new LruBitmapCache();

// ── Render Queue (concurrency limiter) ──────────────────────────────

/**
 * Simple concurrency limiter for render operations.
 * Prevents overloading the native addon with too many parallel renders.
 */
class RenderQueue {
  private active = 0;
  private readonly queue: Array<{
    task: () => Promise<void>;
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wrapped = async (): Promise<void> => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err as Error);
        }
      };
      if (this.active < RENDER_CONCURRENCY_LIMIT) {
        this.active++;
        wrapped().finally(() => this.next());
      } else {
        this.queue.push({
          task: wrapped,
          resolve: () => { /* resolved by wrapped */ },
          reject: (err: Error) => reject(err),
        });
      }
    });
  }

  private next(): void {
    this.active--;
    const item = this.queue.shift();
    if (item) {
      this.active++;
      item.task().finally(() => this.next());
    }
  }
}

const renderQueue = new RenderQueue();

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

  // ── PDF engine operations (PDFium) ──────────────────────────────

  ipcMain.handle(
    IPC_CHANNELS.PDF_OPEN,
    async (_event, payload: PdfOpenPayload): Promise<PdfOpenResult> => {
      return pdfiumEngine.open(payload.data, payload.password);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PDF_CLOSE,
    async (_event, docId: string): Promise<void> => {
      bitmapCache.invalidateDoc(docId);
      pdfiumEngine.close(docId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PDF_GET_PAGE_COUNT,
    async (_event, docId: string): Promise<number> => {
      return pdfiumEngine.getPageCount(docId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PDF_RENDER_PAGE,
    async (_event, payload: PdfRenderPagePayload): Promise<PdfRenderResult> => {
      const cacheKey = LruBitmapCache.makeKey(payload.docId, payload.pageIndex, payload.scale);
      const cached = bitmapCache.get(cacheKey);
      if (cached) {
        return { image: cached.image, width: cached.width, height: cached.height };
      }

      return renderQueue.enqueue(async () => {
        // Double-check cache after waiting in queue
        const secondCheck = bitmapCache.get(cacheKey);
        if (secondCheck) {
          return { image: secondCheck.image, width: secondCheck.width, height: secondCheck.height };
        }

        const result = pdfiumEngine.renderPage(payload.docId, payload.pageIndex, payload.scale);
        bitmapCache.put({
          key: cacheKey,
          image: result.image,
          width: result.width,
          height: result.height,
        });
        return result;
      });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PDF_LIST_OBJECTS,
    async (_event, payload: PdfListObjectsPayload): Promise<PageObject[]> => {
      return pdfiumEngine.listPageObjects(payload.docId, payload.pageIndex);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PDF_EDIT_TEXT,
    async (_event, payload: PdfEditTextPayload): Promise<{ ok: true }> => {
      pdfiumEngine.editTextObject(
        payload.docId,
        payload.pageIndex,
        payload.objectId,
        payload.newText,
        payload.fontName,
        payload.fontSize,
      );
      bitmapCache.invalidatePage(payload.docId, payload.pageIndex);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PDF_REPLACE_IMAGE,
    async (_event, payload: PdfReplaceImagePayload): Promise<{ ok: true }> => {
      pdfiumEngine.replaceImageObject(
        payload.docId,
        payload.pageIndex,
        payload.objectId,
        payload.image,
        payload.format,
      );
      bitmapCache.invalidatePage(payload.docId, payload.pageIndex);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PDF_SAVE,
    async (_event, payload: PdfSavePayload): Promise<PdfSaveResult> => {
      const data = pdfiumEngine.save(payload.docId);
      return { data };
    },
  );

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

/**
 * Clean up PDFium resources.  Called from main/index.ts on app quit.
 */
export function cleanupPdfium(): void {
  bitmapCache.clear();
  pdfiumEngine.closeAll();
}
