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
