/**
 * PdfiumEngine — TypeScript façade over the native PDFium N-API addon.
 *
 * Manages document handles, validates inputs, normalises errors,
 * and provides a typed async interface for the rest of the main process.
 *
 * The native addon is loaded lazily from the platform-specific binary.
 * Until the real addon is built (Task 1-2), a stub is used so the
 * application compiles and IPC wiring can be tested.
 */

import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { app, nativeImage } from 'electron';
import type {
  PdfOpenResult,
  PdfRenderResult,
  PageObject,
  PageObjectType,
} from '../shared/ipc-schema';
import { MAX_IMAGE_BYTES } from '../shared/constants';

// ── Error types ─────────────────────────────────────────────────────

/** Error codes emitted by the PDFium façade. */
export const PDFIUM_ERROR_CODES = {
  ADDON_NOT_FOUND: 'ADDON_NOT_FOUND',
  DOC_NOT_FOUND: 'DOC_NOT_FOUND',
  OPEN_FAILED: 'OPEN_FAILED',
  RENDER_FAILED: 'RENDER_FAILED',
  OBJECT_NOT_FOUND: 'OBJECT_NOT_FOUND',
  EDIT_FAILED: 'EDIT_FAILED',
  SAVE_FAILED: 'SAVE_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
} as const;

export class PdfiumError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PdfiumError';
  }
}

// ── Native addon interface (contract for the C++ N-API module) ──────

/**
 * Shape of the native PDFium addon.
 *
 * Each function operates on an opaque numeric `handle` returned by
 * `openDocument`.  The addon is responsible for thread-safety
 * internally (PDFium's global lock).
 */
interface PdfiumAddon {
  openDocument(data: Buffer, password?: string): number;
  closeDocument(handle: number): void;
  getPageCount(handle: number): number;
  /**
   * Render a page to an RGBA bitmap.
   * Returns { data: Buffer, width: number, height: number }.
   */
  renderPage(handle: number, pageIndex: number, scale: number): {
    data: Buffer;
    width: number;
    height: number;
  };
  /**
   * List text and image objects on a page.
   * Returns array of { id, type, left, top, right, bottom }.
   */
  listPageObjects(handle: number, pageIndex: number): Array<{
    id: number;
    type: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
    text?: string;
  }>;
  editTextObject(
    handle: number,
    pageIndex: number,
    objectId: number,
    newText: string,
    fontName?: string,
    fontSize?: number,
  ): void;
  replaceImageObject(
    handle: number,
    pageIndex: number,
    objectId: number,
    imageData: Buffer,
    format: string,
  ): void;
  /** Replace an image object with raw BGRA pixel data. */
  replaceImageObjectBitmap(
    handle: number,
    pageIndex: number,
    objectId: number,
    bgraData: Buffer,
    width: number,
    height: number,
  ): void;
  /** Serialise the document to a Buffer (FPDF_SaveAsCopy). */
  saveDocument(handle: number): Buffer;
}

// ── Stub addon (used until native build is available) ───────────────

const STUB_ADDON: PdfiumAddon = {
  openDocument(_data: Buffer, _password?: string): number {
    console.warn('[PdfiumEngine] Using STUB addon — native build not yet available');
    return 1;
  },
  closeDocument(_handle: number): void { /* no-op */ },
  getPageCount(_handle: number): number { return 1; },
  renderPage(_handle: number, _pageIndex: number, _scale: number) {
    // Return a minimal 1×1 transparent RGBA bitmap
    const SINGLE_PIXEL_SIZE = 4;
    return { data: Buffer.alloc(SINGLE_PIXEL_SIZE), width: 1, height: 1 };
  },
  listPageObjects(_handle: number, _pageIndex: number) {
    return [];
  },
  editTextObject() { /* no-op */ },
  replaceImageObject() { /* no-op */ },
  replaceImageObjectBitmap() { /* no-op */ },
  saveDocument(_handle: number): Buffer {
    return Buffer.alloc(0);
  },
};

// ── Addon loader ────────────────────────────────────────────────────

/**
 * Resolve the native addon path for both dev and packaged (asar) builds.
 *
 * Dev:       <project>/native/pdfium/build/Release/pdfium.node
 * Packaged:  <resources>/app.asar.unpacked/native/pdfium/build/Release/pdfium.node
 */
function resolveAddonPath(): string {
  const isPackaged = app.isPackaged;
  if (isPackaged) {
    // In packaged mode, asarUnpack extracts files next to the asar archive
    return path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'native', 'pdfium', 'build', 'Release', 'pdfium.node',
    );
  }
  // Dev mode — __dirname is dist/main/, project root is two levels up
  return path.join(
    __dirname, '..', '..', 'native', 'pdfium', 'build', 'Release', 'pdfium.node',
  );
}

function loadAddon(): PdfiumAddon {
  try {
    const addonPath = resolveAddonPath();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const addon = require(addonPath) as PdfiumAddon;
    console.log('[PdfiumEngine] Native addon loaded');
    return addon;
  } catch {
    console.warn(
      '[PdfiumEngine] Native addon not found — falling back to stub. ' +
      'Build the addon with `npm run build:native` (Task 1-2).',
    );
    return STUB_ADDON;
  }
}

// ── PdfiumEngine class ──────────────────────────────────────────────

export class PdfiumEngine {
  private readonly addon: PdfiumAddon;
  /** Map from docId (UUID) → native handle. */
  private readonly handles = new Map<string, number>();
  /**
   * Pin the Buffer passed to FPDF_LoadMemDocument so V8's GC cannot free
   * the underlying memory while PDFium still references it.
   * Released when the document is closed.
   */
  private readonly pinnedBuffers = new Map<string, Buffer>();

  constructor() {
    this.addon = loadAddon();
  }

  // ── Document lifecycle ──────────────────────────────────────────

  /** Open a PDF document and return a docId + page count. */
  open(data: Uint8Array, password?: string): PdfOpenResult {
    const buf = Buffer.from(data);
    try {
      const handle = this.addon.openDocument(buf, password);
      const docId = randomUUID();
      this.handles.set(docId, handle);
      // Keep buf alive for the lifetime of the document — FPDF_LoadMemDocument
      // does NOT copy the data; it holds a pointer into this buffer.
      this.pinnedBuffers.set(docId, buf);
      const pageCount = this.addon.getPageCount(handle);
      return { docId, pageCount };
    } catch (err) {
      throw new PdfiumError(
        PDFIUM_ERROR_CODES.OPEN_FAILED,
        `Failed to open document: ${(err as Error).message}`,
      );
    }
  }

  /** Close a previously opened document. */
  close(docId: string): void {
    const handle = this.requireHandle(docId);
    this.addon.closeDocument(handle);
    this.handles.delete(docId);
    this.pinnedBuffers.delete(docId);
  }

  /** Close all open documents (cleanup on app quit). */
  closeAll(): void {
    for (const [docId, handle] of this.handles.entries()) {
      try {
        this.addon.closeDocument(handle);
      } catch {
        console.warn(`[PdfiumEngine] Failed to close doc ${docId}`);
      }
    }
    this.handles.clear();
    this.pinnedBuffers.clear();
  }

  /** Get page count for an open document. */
  getPageCount(docId: string): number {
    const handle = this.requireHandle(docId);
    return this.addon.getPageCount(handle);
  }

  // ── Rendering ───────────────────────────────────────────────────

  /** Render a page to an RGBA bitmap (PNG-encoded for IPC transfer). */
  renderPage(docId: string, pageIndex: number, scale: number): PdfRenderResult {
    const handle = this.requireHandle(docId);
    this.validatePageIndex(handle, pageIndex);

    if (scale <= 0) {
      throw new PdfiumError(PDFIUM_ERROR_CODES.INVALID_INPUT, 'Scale must be > 0');
    }

    try {
      const result = this.addon.renderPage(handle, pageIndex, scale);
      return {
        image: new Uint8Array(result.data),
        width: result.width,
        height: result.height,
      };
    } catch (err) {
      throw new PdfiumError(
        PDFIUM_ERROR_CODES.RENDER_FAILED,
        `Render failed for page ${pageIndex}: ${(err as Error).message}`,
      );
    }
  }

  // ── Object inspection ───────────────────────────────────────────

  /** List text and image objects on a page. */
  listPageObjects(docId: string, pageIndex: number): PageObject[] {
    const handle = this.requireHandle(docId);
    this.validatePageIndex(handle, pageIndex);

    const raw = this.addon.listPageObjects(handle, pageIndex);
    return raw.map((obj) => ({
      id: obj.id,
      type: obj.type as PageObjectType,
      left: obj.left,
      top: obj.top,
      right: obj.right,
      bottom: obj.bottom,
      ...(obj.text !== undefined ? { text: obj.text } : {}),
    }));
  }

  // ── Editing ─────────────────────────────────────────────────────

  /** Edit the text content of a text object. */
  editTextObject(
    docId: string,
    pageIndex: number,
    objectId: number,
    newText: string,
    fontName?: string,
    fontSize?: number,
  ): void {
    const handle = this.requireHandle(docId);
    this.validatePageIndex(handle, pageIndex);

    if (!newText) {
      throw new PdfiumError(PDFIUM_ERROR_CODES.INVALID_INPUT, 'newText must not be empty');
    }
    if (fontSize !== undefined && fontSize <= 0) {
      throw new PdfiumError(PDFIUM_ERROR_CODES.INVALID_INPUT, 'fontSize must be > 0');
    }

    try {
      this.addon.editTextObject(handle, pageIndex, objectId, newText, fontName, fontSize);
    } catch (err) {
      throw new PdfiumError(
        PDFIUM_ERROR_CODES.EDIT_FAILED,
        `Text edit failed: ${(err as Error).message}`,
      );
    }
  }

  /** Replace an image object with new image data. */
  replaceImageObject(
    docId: string,
    pageIndex: number,
    objectId: number,
    imageData: Uint8Array,
    format: 'png' | 'jpeg',
  ): void {
    const handle = this.requireHandle(docId);
    this.validatePageIndex(handle, pageIndex);

    if (imageData.byteLength > MAX_IMAGE_BYTES) {
      throw new PdfiumError(
        PDFIUM_ERROR_CODES.IMAGE_TOO_LARGE,
        `Image exceeds maximum size of ${MAX_IMAGE_BYTES} bytes`,
      );
    }
    if (format !== 'png' && format !== 'jpeg') {
      throw new PdfiumError(PDFIUM_ERROR_CODES.INVALID_INPUT, 'Format must be "png" or "jpeg"');
    }

    try {
      if (format === 'png') {
        // Decode PNG to raw BGRA bitmap using Electron's nativeImage,
        // then use the bitmap-based replacement path that preserves alpha.
        const img = nativeImage.createFromBuffer(Buffer.from(imageData));
        if (img.isEmpty()) {
          throw new Error('Failed to decode PNG image');
        }
        const size = img.getSize();
        const bgraBuf = img.toBitmap();
        this.addon.replaceImageObjectBitmap(
          handle, pageIndex, objectId,
          bgraBuf, size.width, size.height,
        );
      } else {
        // JPEG path — embed directly via FPDFImageObj_LoadJpegFileInline
        this.addon.replaceImageObject(
          handle, pageIndex, objectId,
          Buffer.from(imageData), format,
        );
      }
    } catch (err) {
      throw new PdfiumError(
        PDFIUM_ERROR_CODES.EDIT_FAILED,
        `Image replace failed: ${(err as Error).message}`,
      );
    }
  }

  // ── Save ────────────────────────────────────────────────────────

  /** Serialise the document to PDF bytes (FPDF_SaveAsCopy). */
  save(docId: string): Uint8Array {
    const handle = this.requireHandle(docId);
    try {
      const buf = this.addon.saveDocument(handle);
      return new Uint8Array(buf);
    } catch (err) {
      throw new PdfiumError(
        PDFIUM_ERROR_CODES.SAVE_FAILED,
        `Save failed: ${(err as Error).message}`,
      );
    }
  }

  // ── Internal helpers ────────────────────────────────────────────

  private requireHandle(docId: string): number {
    const handle = this.handles.get(docId);
    if (handle === undefined) {
      throw new PdfiumError(
        PDFIUM_ERROR_CODES.DOC_NOT_FOUND,
        `No open document with id "${docId}"`,
      );
    }
    return handle;
  }

  private validatePageIndex(handle: number, pageIndex: number): void {
    const count = this.addon.getPageCount(handle);
    if (pageIndex < 0 || pageIndex >= count) {
      throw new PdfiumError(
        PDFIUM_ERROR_CODES.INVALID_INPUT,
        `Page index ${pageIndex} out of range [0, ${count - 1}]`,
      );
    }
  }
}
