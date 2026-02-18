/**
 * Renderer entry point.
 *
 * Communicates with main ONLY through `window.api` (preload bridge).
 * No Node.js or Electron imports here — enforced by contextIsolation + sandbox.
 */

// ── DOM references ──────────────────────────────────────────────────
const btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
const btnSave = document.getElementById('btn-save') as HTMLButtonElement;
const btnSaveAs = document.getElementById('btn-save-as') as HTMLButtonElement;
const fileNameEl = document.getElementById('file-name') as HTMLSpanElement;
const versionEl = document.getElementById('app-version') as HTMLSpanElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const pageInfo = document.getElementById('page-info') as HTMLSpanElement;
const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const viewerContainer = document.getElementById('viewer-container') as HTMLElement;

// ── State ───────────────────────────────────────────────────────────
interface AppState {
  filePath: string | null;
  fileData: Uint8Array | null;
  modified: boolean;
}

const state: AppState = {
  filePath: null,
  fileData: null,
  modified: false,
};

// ── Initialization ──────────────────────────────────────────────────
async function init(): Promise<void> {
  // Display app version
  const version = await window.api.getVersion();
  versionEl.textContent = `v${version}`;

  // Wire toolbar buttons
  btnOpen.addEventListener('click', handleOpen);
  btnSave.addEventListener('click', handleSave);
  btnSaveAs.addEventListener('click', handleSaveAs);

  // Wire drag-and-drop on the viewer/drop zone
  viewerContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone?.classList.add('drag-over');
  });
  viewerContainer.addEventListener('dragleave', () => {
    dropZone?.classList.remove('drag-over');
  });
  viewerContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone?.classList.remove('drag-over');
    // File drop handling will be wired in Task 1-2 (viewer)
  });

  // Wire keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);

  // Subscribe to document events from main
  window.api.onDocumentError((error) => {
    setStatus(`Error: ${error}`);
  });

  setStatus('Ready');
}

// ── Handlers ────────────────────────────────────────────────────────

async function handleOpen(): Promise<void> {
  setStatus('Opening file…');
  const result = await window.api.openFile();
  if (!result) {
    setStatus('Ready');
    return;
  }

  state.filePath = result.filePath;
  state.fileData = result.data;
  state.modified = false;

  const fileName = result.filePath.split(/[\\/]/).pop() ?? 'Untitled';
  fileNameEl.textContent = fileName;
  btnSave.disabled = false;
  btnSaveAs.disabled = false;

  // Hide drop zone; PDF.js rendering will be added in Task 1-2
  if (dropZone) {
    dropZone.style.display = 'none';
  }

  setStatus(`Opened: ${fileName}`);
  pageInfo.textContent = `${result.data.byteLength.toLocaleString()} bytes loaded`;
}

async function handleSave(): Promise<void> {
  if (!state.filePath || !state.fileData) return;

  setStatus('Saving…');
  const ok = await window.api.saveFile({
    filePath: state.filePath,
    data: state.fileData,
  });

  if (ok) {
    state.modified = false;
    setStatus('Saved');
  } else {
    setStatus('Save failed');
  }
}

async function handleSaveAs(): Promise<void> {
  if (!state.fileData) return;

  setStatus('Saving…');
  const newPath = await window.api.saveFileAs(state.fileData);

  if (newPath) {
    state.filePath = newPath;
    state.modified = false;
    const fileName = newPath.split(/[\\/]/).pop() ?? 'Untitled';
    fileNameEl.textContent = fileName;
    setStatus(`Saved as: ${fileName}`);
  } else {
    setStatus('Ready');
  }
}

function handleKeyboard(e: KeyboardEvent): void {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 'o') { e.preventDefault(); handleOpen(); }
  if (mod && !e.shiftKey && e.key === 's') { e.preventDefault(); handleSave(); }
  if (mod && e.shiftKey && e.key === 'S') { e.preventDefault(); handleSaveAs(); }
}

// ── Utilities ───────────────────────────────────────────────────────

function setStatus(text: string): void {
  statusText.textContent = text;
}

// ── Boot ────────────────────────────────────────────────────────────
init().catch((err) => {
  console.error('[Renderer] Init failed:', err);
  setStatus('Initialization error');
});
