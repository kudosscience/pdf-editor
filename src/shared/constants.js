"use strict";
/**
 * Shared constants used across main, preload, and renderer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_RECENT_FILES = exports.PDF_FILE_FILTERS = exports.CONTENT_SECURITY_POLICY = exports.MIN_WINDOW_HEIGHT = exports.MIN_WINDOW_WIDTH = exports.DEFAULT_WINDOW_HEIGHT = exports.DEFAULT_WINDOW_WIDTH = exports.APP_ID = exports.APP_NAME = void 0;
/** Application metadata. */
exports.APP_NAME = 'PDF Editor';
exports.APP_ID = 'com.pdfeditor.app';
/** Default window dimensions. */
exports.DEFAULT_WINDOW_WIDTH = 1280;
exports.DEFAULT_WINDOW_HEIGHT = 800;
exports.MIN_WINDOW_WIDTH = 800;
exports.MIN_WINDOW_HEIGHT = 600;
/** Content Security Policy applied to every BrowserWindow. */
exports.CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // inline styles needed for PDF.js
    "img-src 'self' data: blob:", // PDF raster tiles
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:", // PDF.js web-worker
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
].join('; ');
/** Supported file extensions for open/save dialogs. */
exports.PDF_FILE_FILTERS = [
    { name: 'PDF Files', extensions: ['pdf'] },
    { name: 'All Files', extensions: ['*'] },
];
/** Maximum recent files to track. */
exports.MAX_RECENT_FILES = 10;
//# sourceMappingURL=constants.js.map