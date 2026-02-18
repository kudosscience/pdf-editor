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

// ── Channel name constants ──────────────────────────────────────────
export const IPC_CHANNELS = {
  // File operations
  FILE_OPEN: 'file:open',
  FILE_SAVE: 'file:save',
  FILE_SAVE_AS: 'file:save-as',
  FILE_GET_RECENT: 'file:get-recent',

  // Document info relayed to renderer after open
  DOCUMENT_OPENED: 'document:opened',
  DOCUMENT_SAVED: 'document:saved',
  DOCUMENT_ERROR: 'document:error',

  // App lifecycle
  APP_GET_VERSION: 'app:get-version',
  APP_QUIT: 'app:quit',

  // Auto-update
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATUS: 'update:status',
} as const;

/** Union of all allowed channel names. */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// ── Payload types (main → renderer, renderer → main) ────────────────

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

// ── Channel allow-list for validation ───────────────────────────────
const ALLOWED_CHANNELS = new Set<string>(Object.values(IPC_CHANNELS));

/**
 * Validate that a channel name is in the allow-list.
 * Used by both main and preload to reject unknown channels.
 */
export function isAllowedChannel(channel: string): channel is IpcChannel {
  return ALLOWED_CHANNELS.has(channel);
}
