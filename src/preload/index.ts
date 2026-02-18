/**
 * Preload script — runs in an isolated context with access to Node APIs.
 *
 * Exposes a minimal, typed API to the renderer via contextBridge.
 * NO direct Node or Electron APIs leak to the renderer.
 */

import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  isAllowedChannel,
  type FileOpenResult,
  type FileSavePayload,
  type UpdateStatusPayload,
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

/**
 * Typed API surface exposed to the renderer as `window.api`.
 */
const api = {
  // ── File operations ─────────────────────────────────────────────
  openFile: (): Promise<FileOpenResult | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN),

  saveFile: (payload: FileSavePayload): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE, payload),

  saveFileAs: (data: Uint8Array): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_AS, data),

  getRecentFiles: (): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_GET_RECENT),

  // ── App lifecycle ───────────────────────────────────────────────
  getVersion: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),

  quit: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT),

  // ── Auto-update ─────────────────────────────────────────────────
  checkForUpdates: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),

  downloadUpdate: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD),

  installUpdate: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),

  /** Subscribe to update status events from main. */
  onUpdateStatus: (callback: (payload: UpdateStatusPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: UpdateStatusPayload): void => {
      callback(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, handler);
    // Return an unsubscribe function
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, handler);
  },

  // ── Document events (main → renderer) ──────────────────────────
  onDocumentOpened: (callback: (payload: { filePath: string; pageCount: number }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { filePath: string; pageCount: number }): void => {
      callback(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.DOCUMENT_OPENED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DOCUMENT_OPENED, handler);
  },

  onDocumentError: (callback: (error: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string): void => {
      callback(error);
    };
    ipcRenderer.on(IPC_CHANNELS.DOCUMENT_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DOCUMENT_ERROR, handler);
  },

  // ── PDF engine (PDFium) ─────────────────────────────────────────

  pdf: {
    open: (payload: PdfOpenPayload): Promise<PdfOpenResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.PDF_OPEN, payload),

    close: (docId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PDF_CLOSE, docId),

    getPageCount: (docId: string): Promise<number> =>
      ipcRenderer.invoke(IPC_CHANNELS.PDF_GET_PAGE_COUNT, docId),

    renderPage: (payload: PdfRenderPagePayload): Promise<PdfRenderResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.PDF_RENDER_PAGE, payload),

    listObjects: (payload: PdfListObjectsPayload): Promise<PageObject[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PDF_LIST_OBJECTS, payload),

    editText: (payload: PdfEditTextPayload): Promise<{ ok: true }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PDF_EDIT_TEXT, payload),

    replaceImage: (payload: PdfReplaceImagePayload): Promise<{ ok: true }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PDF_REPLACE_IMAGE, payload),

    save: (payload: PdfSavePayload): Promise<PdfSaveResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.PDF_SAVE, payload),

    /** Subscribe to page-rendered events from main. */
    onPageRendered: (callback: (payload: { docId: string; pageIndex: number }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { docId: string; pageIndex: number }): void => {
        callback(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.PDF_PAGE_RENDERED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PDF_PAGE_RENDERED, handler);
    },
  },
};

// ── Validate and expose ─────────────────────────────────────────────
// Double-check that every channel we use is in the allow-list
for (const channel of Object.values(IPC_CHANNELS)) {
  if (!isAllowedChannel(channel)) {
    throw new Error(`[Preload] Channel "${channel}" is not in the allow-list — fix ipc-schema.ts`);
  }
}

contextBridge.exposeInMainWorld('api', api);

/** Type declaration for the renderer — importable as a global. */
export type PdfEditorApi = typeof api;
