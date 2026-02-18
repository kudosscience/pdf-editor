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
}

declare global {
  interface Window {
    api: PdfEditorApi;
  }
}

export {};
