/**
 * Shared constants used across main, preload, and renderer.
 */

/** Application metadata. */
export const APP_NAME = 'PDF Editor';
export const APP_ID = 'com.pdfeditor.app';

/** Default window dimensions. */
export const DEFAULT_WINDOW_WIDTH = 1280;
export const DEFAULT_WINDOW_HEIGHT = 800;
export const MIN_WINDOW_WIDTH = 800;
export const MIN_WINDOW_HEIGHT = 600;

/** Content Security Policy applied to every BrowserWindow. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",   // inline styles needed for PDF.js
  "img-src 'self' data: blob:",          // PDF raster tiles
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",             // PDF.js web-worker
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Supported file extensions for open/save dialogs. */
export const PDF_FILE_FILTERS = [
  { name: 'PDF Files', extensions: ['pdf'] },
  { name: 'All Files', extensions: ['*'] },
];

/** Maximum recent files to track. */
export const MAX_RECENT_FILES = 10;

// ── PDFium engine constants ─────────────────────────────────────────

/** Maximum bytes for the in-memory rendered bitmap LRU cache. */
export const MAX_BITMAP_CACHE_BYTES = 256 * 1024 * 1024; // 256 MB

/** Maximum concurrent render operations dispatched to the PDFium addon. */
export const RENDER_CONCURRENCY_LIMIT = 4;

/** Maximum allowed image size (bytes) for image replacement. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB

/** Default render scale (1.0 = 72 DPI, matching PDF points). */
export const DEFAULT_RENDER_SCALE = 1.5;

/** Zoom bounds for the viewer (percentage converted to scale internally). */
export const MIN_ZOOM_PERCENT = 25;
export const MAX_ZOOM_PERCENT = 500;
export const DEFAULT_ZOOM_PERCENT = 100;
export const ZOOM_STEP_PERCENT = 25;

/** Maximum depth for the undo stack. */
export const MAX_UNDO_DEPTH = 100;
