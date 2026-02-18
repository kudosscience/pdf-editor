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

  // PDF engine (PDFium) — viewer & editing
  PDF_OPEN: 'pdf:open',
  PDF_CLOSE: 'pdf:close',
  PDF_GET_PAGE_COUNT: 'pdf:get-page-count',
  PDF_RENDER_PAGE: 'pdf:render-page',
  PDF_LIST_OBJECTS: 'pdf:list-objects',
  PDF_EDIT_TEXT: 'pdf:edit-text',
  PDF_REPLACE_IMAGE: 'pdf:replace-image',
  PDF_SAVE: 'pdf:save',

  // PDF events (main → renderer)
  PDF_PAGE_RENDERED: 'pdf:page-rendered',
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

// ── PDF engine payload types ────────────────────────────────────────

/** Payload for opening a PDF document via PDFium. */
export interface PdfOpenPayload {
  /** Raw PDF bytes. */
  data: Uint8Array;
  /** Optional password for encrypted PDFs. */
  password?: string;
}

/** Result of opening a PDF document. */
export interface PdfOpenResult {
  /** Unique document identifier (UUID). */
  docId: string;
  /** Total number of pages. */
  pageCount: number;
}

/** Payload for rendering a single page. */
export interface PdfRenderPagePayload {
  docId: string;
  pageIndex: number;
  /** Device-pixel scale (e.g. 1.0 = 72 dpi, 2.0 = 144 dpi). */
  scale: number;
}

/** Result of a page render. */
export interface PdfRenderResult {
  /** RGBA bitmap encoded as PNG bytes for transfer. */
  image: Uint8Array;
  /** Page width in PDF points. */
  width: number;
  /** Page height in PDF points. */
  height: number;
}

/** Payload for listing page objects (text & image). */
export interface PdfListObjectsPayload {
  docId: string;
  pageIndex: number;
}

/** Classification of a page object. */
export type PageObjectType = 'text' | 'image' | 'path' | 'shading' | 'form';

/** A single page object descriptor. */
export interface PageObject {
  id: number;
  type: PageObjectType;
  /** Bounding box in PDF points (origin = bottom-left). */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Payload for editing text content of an object. */
export interface PdfEditTextPayload {
  docId: string;
  pageIndex: number;
  objectId: number;
  newText: string;
  fontName?: string;
  fontSize?: number;
}

/** Payload for replacing an image object. */
export interface PdfReplaceImagePayload {
  docId: string;
  pageIndex: number;
  objectId: number;
  image: Uint8Array;
  format: 'png' | 'jpeg';
}

/** Payload for saving a document. */
export interface PdfSavePayload {
  docId: string;
}

/** Result of a save operation. */
export interface PdfSaveResult {
  /** Serialized PDF bytes ready for writing to disk. */
  data: Uint8Array;
}

/** Error payload from PDFium operations. */
export interface PdfiumErrorPayload {
  code: string;
  message: string;
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
