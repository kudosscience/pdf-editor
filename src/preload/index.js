/**
 * Preload script — runs in an isolated context with access to Node APIs.
 *
 * Exposes a minimal, typed API to the renderer via contextBridge.
 * NO direct Node or Electron APIs leak to the renderer.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, isAllowedChannel, } from '../shared/ipc-schema';
/**
 * Typed API surface exposed to the renderer as `window.api`.
 */
const api = {
    // ── File operations ─────────────────────────────────────────────
    openFile: () => ipcRenderer.invoke(IPC_CHANNELS.FILE_OPEN),
    saveFile: (payload) => ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE, payload),
    saveFileAs: (data) => ipcRenderer.invoke(IPC_CHANNELS.FILE_SAVE_AS, data),
    getRecentFiles: () => ipcRenderer.invoke(IPC_CHANNELS.FILE_GET_RECENT),
    // ── App lifecycle ───────────────────────────────────────────────
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
    quit: () => ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT),
    // ── Auto-update ─────────────────────────────────────────────────
    checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
    downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD),
    installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),
    /** Subscribe to update status events from main. */
    onUpdateStatus: (callback) => {
        const handler = (_event, payload) => {
            callback(payload);
        };
        ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, handler);
        // Return an unsubscribe function
        return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, handler);
    },
    // ── Document events (main → renderer) ──────────────────────────
    onDocumentOpened: (callback) => {
        const handler = (_event, payload) => {
            callback(payload);
        };
        ipcRenderer.on(IPC_CHANNELS.DOCUMENT_OPENED, handler);
        return () => ipcRenderer.removeListener(IPC_CHANNELS.DOCUMENT_OPENED, handler);
    },
    onDocumentError: (callback) => {
        const handler = (_event, error) => {
            callback(error);
        };
        ipcRenderer.on(IPC_CHANNELS.DOCUMENT_ERROR, handler);
        return () => ipcRenderer.removeListener(IPC_CHANNELS.DOCUMENT_ERROR, handler);
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
//# sourceMappingURL=index.js.map