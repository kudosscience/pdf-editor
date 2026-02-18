/**
 * Type declarations for globals exposed by the preload script.
 *
 * Kept self-contained to avoid the renderer tsconfig pulling in
 * preload/shared source files (different module system).
 */

interface UpdateStatusPayload {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  progress?: number;
  error?: string;
}

interface FileOpenResult {
  filePath: string;
  data: Uint8Array;
}

interface FileSavePayload {
  filePath: string;
  data: Uint8Array;
}

// ── PDF engine types (mirrors ipc-schema.ts) ────────────────────────

interface PdfOpenPayload {
  data: Uint8Array;
  password?: string;
}

interface PdfOpenResult {
  docId: string;
  pageCount: number;
}

interface PdfRenderPagePayload {
  docId: string;
  pageIndex: number;
  scale: number;
}

interface PdfRenderResult {
  image: Uint8Array;
  width: number;
  height: number;
}

interface PdfListObjectsPayload {
  docId: string;
  pageIndex: number;
}

type PageObjectType = 'text' | 'image' | 'path' | 'shading' | 'form';

interface PageObject {
  id: number;
  type: PageObjectType;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface PdfEditTextPayload {
  docId: string;
  pageIndex: number;
  objectId: number;
  newText: string;
  fontName?: string;
  fontSize?: number;
}

interface PdfReplaceImagePayload {
  docId: string;
  pageIndex: number;
  objectId: number;
  image: Uint8Array;
  format: 'png' | 'jpeg';
}

interface PdfSavePayload {
  docId: string;
}

interface PdfSaveResult {
  data: Uint8Array;
}

// ── PDF sub-API surface ─────────────────────────────────────────────

interface PdfApi {
  open(payload: PdfOpenPayload): Promise<PdfOpenResult>;
  close(docId: string): Promise<void>;
  getPageCount(docId: string): Promise<number>;
  renderPage(payload: PdfRenderPagePayload): Promise<PdfRenderResult>;
  listObjects(payload: PdfListObjectsPayload): Promise<PageObject[]>;
  editText(payload: PdfEditTextPayload): Promise<{ ok: true }>;
  replaceImage(payload: PdfReplaceImagePayload): Promise<{ ok: true }>;
  save(payload: PdfSavePayload): Promise<PdfSaveResult>;
  onPageRendered(callback: (payload: { docId: string; pageIndex: number }) => void): () => void;
}

interface PdfEditorApi {
  openFile(): Promise<FileOpenResult | null>;
  saveFile(payload: FileSavePayload): Promise<boolean>;
  saveFileAs(data: Uint8Array): Promise<string | null>;
  getRecentFiles(): Promise<string[]>;
  getVersion(): Promise<string>;
  quit(): Promise<void>;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdateStatus(callback: (payload: UpdateStatusPayload) => void): () => void;
  onDocumentOpened(callback: (payload: { filePath: string; pageCount: number }) => void): () => void;
  onDocumentError(callback: (error: string) => void): () => void;
  pdf: PdfApi;
}

interface Window {
  api: PdfEditorApi;
}
