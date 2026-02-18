/**
 * Shared constants used across main, preload, and renderer.
 */
/** Application metadata. */
export declare const APP_NAME = "PDF Editor";
export declare const APP_ID = "com.pdfeditor.app";
/** Default window dimensions. */
export declare const DEFAULT_WINDOW_WIDTH = 1280;
export declare const DEFAULT_WINDOW_HEIGHT = 800;
export declare const MIN_WINDOW_WIDTH = 800;
export declare const MIN_WINDOW_HEIGHT = 600;
/** Content Security Policy applied to every BrowserWindow. */
export declare const CONTENT_SECURITY_POLICY: string;
/** Supported file extensions for open/save dialogs. */
export declare const PDF_FILE_FILTERS: {
    name: string;
    extensions: string[];
}[];
/** Maximum recent files to track. */
export declare const MAX_RECENT_FILES = 10;
//# sourceMappingURL=constants.d.ts.map