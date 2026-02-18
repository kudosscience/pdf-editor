/**
 * Shared IPC channel definitions and type contracts.
 *
 * All IPC communication between main ↔ renderer MUST go through
 * channels defined here.  Adding a channel requires updating:
 *   1. This file (schema)
 *   2. src/main/ipc-handlers.ts (main-side handler)
 *   3. src/preload/index.ts (bridge exposure)
 *
 * NO other IPC paths are permitted.
 */
export declare const IPC_CHANNELS: {
    readonly FILE_OPEN: "file:open";
    readonly FILE_SAVE: "file:save";
    readonly FILE_SAVE_AS: "file:save-as";
    readonly FILE_GET_RECENT: "file:get-recent";
    readonly DOCUMENT_OPENED: "document:opened";
    readonly DOCUMENT_SAVED: "document:saved";
    readonly DOCUMENT_ERROR: "document:error";
    readonly APP_GET_VERSION: "app:get-version";
    readonly APP_QUIT: "app:quit";
    readonly UPDATE_CHECK: "update:check";
    readonly UPDATE_DOWNLOAD: "update:download";
    readonly UPDATE_INSTALL: "update:install";
    readonly UPDATE_STATUS: "update:status";
};
/** Union of all allowed channel names. */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
/** Result of a file-open dialog. */
export interface FileOpenResult {
    filePath: string;
    data: Uint8Array;
}
/** Payload sent when a document has been opened. */
export interface DocumentOpenedPayload {
    filePath: string;
    pageCount: number;
}
/** Payload for save operations. */
export interface FileSavePayload {
    filePath: string;
    data: Uint8Array;
}
/** Status payload for auto-update events. */
export interface UpdateStatusPayload {
    status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
    version?: string;
    progress?: number;
    error?: string;
}
/**
 * Validate that a channel name is in the allow-list.
 * Used by both main and preload to reject unknown channels.
 */
export declare function isAllowedChannel(channel: string): channel is IpcChannel;
//# sourceMappingURL=ipc-schema.d.ts.map