/**
 * Renderer entry point.
 *
 * Communicates with main ONLY through `window.api` (preload bridge).
 * No Node.js or Electron imports here — enforced by contextIsolation + sandbox.
 *
 * Implements:
 *   - PDF open via PDFium engine (canvas rendering)
 *   - Zoom / pan / page navigation
 *   - Object selection & hit-testing
 *   - In-place text editing
 *   - Image replacement
 *   - Undo / redo command stack
 *   - Dirty state tracking with close guard
 */

// ── Constants (mirrors shared/constants.ts without import) ──────────
const MIN_ZOOM_PERCENT = 25;
const MAX_ZOOM_PERCENT = 500;
const DEFAULT_ZOOM_PERCENT = 100;
const ZOOM_STEP_PERCENT = 25;
const MAX_UNDO_DEPTH = 100;

// ── DOM references ──────────────────────────────────────────────────
const btnOpen = document.getElementById('btn-open') as HTMLButtonElement;
const btnSave = document.getElementById('btn-save') as HTMLButtonElement;
const btnSaveAs = document.getElementById('btn-save-as') as HTMLButtonElement;
const fileNameEl = document.getElementById('file-name') as HTMLSpanElement;
const versionEl = document.getElementById('app-version') as HTMLSpanElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const pageInfo = document.getElementById('page-info') as HTMLSpanElement;
const zoomInfoEl = document.getElementById('zoom-info') as HTMLSpanElement;
const dirtyIndicator = document.getElementById('dirty-indicator') as HTMLSpanElement;
const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const viewerContainer = document.getElementById('viewer-container') as HTMLElement;
const canvasWrapper = document.getElementById('canvas-wrapper') as HTMLDivElement;
const pageCanvas = document.getElementById('page-canvas') as HTMLCanvasElement;
const overlayCanvas = document.getElementById('overlay-canvas') as HTMLCanvasElement;

// Zoom controls
const btnZoomIn = document.getElementById('btn-zoom-in') as HTMLButtonElement;
const btnZoomOut = document.getElementById('btn-zoom-out') as HTMLButtonElement;
const btnZoomFit = document.getElementById('btn-zoom-fit') as HTMLButtonElement;
const zoomLevelEl = document.getElementById('zoom-level') as HTMLSpanElement;

// Page navigation
const btnPrevPage = document.getElementById('btn-prev-page') as HTMLButtonElement;
const btnNextPage = document.getElementById('btn-next-page') as HTMLButtonElement;
const pageInput = document.getElementById('page-input') as HTMLInputElement;
const pageTotalEl = document.getElementById('page-total') as HTMLSpanElement;

// Editing tools
const btnToolSelect = document.getElementById('btn-tool-select') as HTMLButtonElement;
const btnToolEditText = document.getElementById('btn-tool-edit-text') as HTMLButtonElement;
const btnToolReplaceImage = document.getElementById('btn-tool-replace-image') as HTMLButtonElement;
const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;

// Thumbnails panel
const thumbnailsPanel = document.getElementById('thumbnails-panel') as HTMLElement;

// ── State ───────────────────────────────────────────────────────────

type ToolMode = 'select' | 'edit-text' | 'replace-image';

interface AppState {
  filePath: string | null;
  fileData: Uint8Array | null;
  docId: string | null;
  pageCount: number;
  currentPage: number;     // 0-based
  zoomPercent: number;
  modified: boolean;
  toolMode: ToolMode;
  pageObjects: PageObject[];
  selectedObjectId: number | null;
}

const state: AppState = {
  filePath: null,
  fileData: null,
  docId: null,
  pageCount: 0,
  currentPage: 0,
  zoomPercent: DEFAULT_ZOOM_PERCENT,
  modified: false,
  toolMode: 'select',
  pageObjects: [],
  selectedObjectId: null,
};

// ── Undo / Redo ─────────────────────────────────────────────────────

interface EditCommand {
  description: string;
  execute(): Promise<void>;
  undo(): Promise<void>;
}

class UndoStack {
  private readonly commands: EditCommand[] = [];
  private pointer = -1; // index of last executed command

  async push(cmd: EditCommand): Promise<void> {
    // Discard any redo history beyond current pointer
    this.commands.splice(this.pointer + 1);
    this.commands.push(cmd);
    // Enforce max depth
    if (this.commands.length > MAX_UNDO_DEPTH) {
      this.commands.shift();
    }
    this.pointer = this.commands.length - 1;
    await cmd.execute();
    this.updateButtons();
  }

  async undo(): Promise<void> {
    if (this.pointer < 0) return;
    const cmd = this.commands[this.pointer];
    await cmd.undo();
    this.pointer--;
    this.updateButtons();
  }

  async redo(): Promise<void> {
    if (this.pointer >= this.commands.length - 1) return;
    this.pointer++;
    const cmd = this.commands[this.pointer];
    await cmd.execute();
    this.updateButtons();
  }

  get canUndo(): boolean { return this.pointer >= 0; }
  get canRedo(): boolean { return this.pointer < this.commands.length - 1; }

  clear(): void {
    this.commands.length = 0;
    this.pointer = -1;
    this.updateButtons();
  }

  private updateButtons(): void {
    btnUndo.disabled = !this.canUndo;
    btnRedo.disabled = !this.canRedo;
  }
}

const undoStack = new UndoStack();

// ── Initialization ──────────────────────────────────────────────────
async function init(): Promise<void> {
  const version = await window.api.getVersion();
  versionEl.textContent = `v${version}`;

  // Wire toolbar buttons
  btnOpen.addEventListener('click', handleOpen);
  btnSave.addEventListener('click', handleSave);
  btnSaveAs.addEventListener('click', handleSaveAs);

  // Zoom
  btnZoomIn.addEventListener('click', () => setZoom(state.zoomPercent + ZOOM_STEP_PERCENT));
  btnZoomOut.addEventListener('click', () => setZoom(state.zoomPercent - ZOOM_STEP_PERCENT));
  btnZoomFit.addEventListener('click', handleZoomFit);

  // Page navigation
  btnPrevPage.addEventListener('click', () => goToPage(state.currentPage - 1));
  btnNextPage.addEventListener('click', () => goToPage(state.currentPage + 1));
  pageInput.addEventListener('change', () => {
    const p = parseInt(pageInput.value, 10) - 1; // convert 1-based to 0-based
    if (!isNaN(p)) goToPage(p);
  });

  // Editing tools
  btnToolSelect.addEventListener('click', () => setToolMode('select'));
  btnToolEditText.addEventListener('click', () => setToolMode('edit-text'));
  btnToolReplaceImage.addEventListener('click', () => setToolMode('replace-image'));
  btnUndo.addEventListener('click', () => undoStack.undo());
  btnRedo.addEventListener('click', () => undoStack.redo());

  // Canvas click for object selection
  overlayCanvas.addEventListener('click', handleCanvasClick);
  overlayCanvas.addEventListener('dblclick', handleCanvasDblClick);

  // Wire drag-and-drop
  viewerContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone?.classList.add('drag-over');
  });
  viewerContainer.addEventListener('dragleave', () => {
    dropZone?.classList.remove('drag-over');
  });
  viewerContainer.addEventListener('drop', handleDrop);

  // Wire keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);

  // Subscribe to events from main
  window.api.onDocumentError((error) => setStatus(`Error: ${error}`));

  // Close guard
  window.addEventListener('beforeunload', (e) => {
    if (state.modified) {
      e.preventDefault();
      // Most browsers require returnValue to be set
      e.returnValue = '';
    }
  });

  setStatus('Ready');
}

// ── File handlers ───────────────────────────────────────────────────

async function handleOpen(): Promise<void> {
  setStatus('Opening file…');
  const result = await window.api.openFile();
  if (!result) { setStatus('Ready'); return; }

  // Close previous document if any
  if (state.docId) {
    await window.api.pdf.close(state.docId);
  }

  state.filePath = result.filePath;
  state.fileData = result.data;

  // Open via PDFium
  try {
    const pdfResult = await window.api.pdf.open({ data: result.data });
    state.docId = pdfResult.docId;
    state.pageCount = pdfResult.pageCount;
    state.currentPage = 0;
    state.modified = false;
    state.selectedObjectId = null;
    state.pageObjects = [];
    undoStack.clear();
  } catch (err) {
    setStatus(`Failed to open PDF: ${(err as Error).message}`);
    return;
  }

  const fileName = result.filePath.split(/[\\/]/).pop() ?? 'Untitled';
  fileNameEl.textContent = fileName;
  document.title = `${fileName} — PDF Editor`;

  enableDocumentControls();

  // Hide drop zone, show canvas
  dropZone.style.display = 'none';
  canvasWrapper.style.display = 'grid';

  updatePageInfo();
  updateZoomInfo();
  updateDirtyIndicator();
  await renderCurrentPage();
  await buildThumbnails();

  setStatus(`Opened: ${fileName} (${state.pageCount} page${state.pageCount !== 1 ? 's' : ''})`);
}

async function handleSave(): Promise<void> {
  if (!state.docId || !state.filePath) return;
  setStatus('Saving…');

  try {
    const result = await window.api.pdf.save({ docId: state.docId });
    const ok = await window.api.saveFile({ filePath: state.filePath, data: result.data });
    if (ok) {
      state.modified = false;
      state.fileData = result.data;
      updateDirtyIndicator();
      setStatus('Saved');
    } else {
      setStatus('Save failed');
    }
  } catch (err) {
    setStatus(`Save error: ${(err as Error).message}`);
  }
}

async function handleSaveAs(): Promise<void> {
  if (!state.docId) return;
  setStatus('Saving…');

  try {
    const result = await window.api.pdf.save({ docId: state.docId });
    const newPath = await window.api.saveFileAs(result.data);
    if (newPath) {
      state.filePath = newPath;
      state.modified = false;
      state.fileData = result.data;
      const fileName = newPath.split(/[\\/]/).pop() ?? 'Untitled';
      fileNameEl.textContent = fileName;
      document.title = `${fileName} — PDF Editor`;
      updateDirtyIndicator();
      setStatus(`Saved as: ${fileName}`);
    } else {
      setStatus('Ready');
    }
  } catch (err) {
    setStatus(`Save error: ${(err as Error).message}`);
  }
}

async function handleDrop(e: DragEvent): Promise<void> {
  e.preventDefault();
  dropZone?.classList.remove('drag-over');

  const file = e.dataTransfer?.files[0];
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) return;

  const arrayBuf = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuf);

  if (state.docId) {
    await window.api.pdf.close(state.docId);
  }

  state.filePath = file.name; // No full path from drag-drop
  state.fileData = data;

  try {
    const pdfResult = await window.api.pdf.open({ data });
    state.docId = pdfResult.docId;
    state.pageCount = pdfResult.pageCount;
    state.currentPage = 0;
    state.modified = false;
    state.selectedObjectId = null;
    state.pageObjects = [];
    undoStack.clear();
  } catch (err) {
    setStatus(`Failed to open PDF: ${(err as Error).message}`);
    return;
  }

  fileNameEl.textContent = file.name;
  document.title = `${file.name} — PDF Editor`;

  enableDocumentControls();
  dropZone.style.display = 'none';
  canvasWrapper.style.display = 'grid';

  updatePageInfo();
  updateZoomInfo();
  updateDirtyIndicator();
  await renderCurrentPage();
  await buildThumbnails();

  setStatus(`Opened: ${file.name}`);
}

// ── Rendering ───────────────────────────────────────────────────────

async function renderCurrentPage(): Promise<void> {
  if (!state.docId) return;

  const scale = state.zoomPercent / 100;
  try {
    const result = await window.api.pdf.renderPage({
      docId: state.docId,
      pageIndex: state.currentPage,
      scale,
    });

    const ctx = pageCanvas.getContext('2d');
    if (!ctx) return;

    pageCanvas.width = result.width;
    pageCanvas.height = result.height;

    // The result.image is RGBA bitmap data from PDFium
    const imageData = new ImageData(
      new Uint8ClampedArray(result.image),
      result.width,
      result.height,
    );
    ctx.putImageData(imageData, 0, 0);

    // Size overlay canvas to match
    overlayCanvas.width = result.width;
    overlayCanvas.height = result.height;
    overlayCanvas.style.width = pageCanvas.style.width = `${result.width}px`;
    overlayCanvas.style.height = pageCanvas.style.height = `${result.height}px`;

    // Fetch objects for this page
    await loadPageObjects();

    // Redraw selection overlay
    drawSelectionOverlay();
  } catch (err) {
    setStatus(`Render error: ${(err as Error).message}`);
  }
}

async function loadPageObjects(): Promise<void> {
  if (!state.docId) return;
  try {
    state.pageObjects = await window.api.pdf.listObjects({
      docId: state.docId,
      pageIndex: state.currentPage,
    });
  } catch {
    state.pageObjects = [];
  }
}

function drawSelectionOverlay(): void {
  const ctx = overlayCanvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  if (state.selectedObjectId === null) return;

  const obj = state.pageObjects.find((o) => o.id === state.selectedObjectId);
  if (!obj) return;

  const scale = state.zoomPercent / 100;

  // Convert PDF coordinates (bottom-left origin) to canvas (top-left origin)
  const x = obj.left * scale;
  const y = (overlayCanvas.height / scale - obj.top) * scale; // flip Y
  const w = (obj.right - obj.left) * scale;
  const h = (obj.top - obj.bottom) * scale;

  ctx.strokeStyle = '#0078d4';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 2]);
  ctx.strokeRect(x, y, w, h);

  // Draw corner handles
  const HANDLE_SIZE = 6;
  ctx.fillStyle = '#0078d4';
  ctx.setLineDash([]);
  const corners = [
    [x, y], [x + w, y],
    [x, y + h], [x + w, y + h],
  ];
  for (const [cx, cy] of corners) {
    ctx.fillRect(cx - HANDLE_SIZE / 2, cy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
  }
}

// ── Thumbnails ──────────────────────────────────────────────────────

async function buildThumbnails(): Promise<void> {
  if (!state.docId) return;

  thumbnailsPanel.innerHTML = '';
  const THUMB_SCALE = 0.2;

  for (let i = 0; i < state.pageCount; i++) {
    const wrapper = document.createElement('div');
    wrapper.className = 'thumbnail-item';
    if (i === state.currentPage) wrapper.classList.add('active');
    wrapper.dataset.page = String(i);

    const label = document.createElement('span');
    label.className = 'thumbnail-label';
    label.textContent = String(i + 1);

    const canvas = document.createElement('canvas');
    canvas.className = 'thumbnail-canvas';

    wrapper.appendChild(canvas);
    wrapper.appendChild(label);
    thumbnailsPanel.appendChild(wrapper);

    wrapper.addEventListener('click', () => goToPage(i));

    // Render thumbnail asynchronously
    try {
      const result = await window.api.pdf.renderPage({
        docId: state.docId!,
        pageIndex: i,
        scale: THUMB_SCALE,
      });
      canvas.width = result.width;
      canvas.height = result.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imgData = new ImageData(
          new Uint8ClampedArray(result.image),
          result.width,
          result.height,
        );
        ctx.putImageData(imgData, 0, 0);
      }
    } catch {
      // Thumbnail render failed — leave blank
    }
  }
}

function updateActiveThumbnail(): void {
  const items = thumbnailsPanel.querySelectorAll('.thumbnail-item');
  items.forEach((el, idx) => {
    el.classList.toggle('active', idx === state.currentPage);
  });
}

// ── Page navigation ─────────────────────────────────────────────────

async function goToPage(pageIndex: number): Promise<void> {
  if (pageIndex < 0 || pageIndex >= state.pageCount) return;
  state.currentPage = pageIndex;
  state.selectedObjectId = null;
  updatePageInfo();
  updateActiveThumbnail();
  await renderCurrentPage();
}

// ── Zoom ────────────────────────────────────────────────────────────

async function setZoom(percent: number): Promise<void> {
  const clamped = Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, percent));
  if (clamped === state.zoomPercent) return;
  state.zoomPercent = clamped;
  updateZoomInfo();
  await renderCurrentPage();
}

function handleZoomFit(): void {
  if (!state.docId) return;
  // Approximate: set zoom so page width fills viewer container
  const containerWidth = viewerContainer.clientWidth - 40; // padding
  const pageWidth = pageCanvas.width / (state.zoomPercent / 100);
  if (pageWidth > 0) {
    const fitPercent = Math.round((containerWidth / pageWidth) * 100);
    setZoom(fitPercent);
  }
}

// ── Object selection & hit testing ──────────────────────────────────

function handleCanvasClick(e: MouseEvent): void {
  if (!state.docId) return;

  const rect = overlayCanvas.getBoundingClientRect();
  const canvasX = e.clientX - rect.left;
  const canvasY = e.clientY - rect.top;
  const scale = state.zoomPercent / 100;

  // Convert canvas coordinates to PDF coordinates
  const pdfX = canvasX / scale;
  const pdfY = (overlayCanvas.height - canvasY) / scale; // flip Y for PDF coords

  // Hit-test against page objects (last = topmost)
  let hit: PageObject | null = null;
  for (let i = state.pageObjects.length - 1; i >= 0; i--) {
    const obj = state.pageObjects[i];
    if (pdfX >= obj.left && pdfX <= obj.right && pdfY >= obj.bottom && pdfY <= obj.top) {
      hit = obj;
      break;
    }
  }

  state.selectedObjectId = hit ? hit.id : null;
  drawSelectionOverlay();
  updatePropertiesPanel(hit);
}

function handleCanvasDblClick(e: MouseEvent): void {
  if (!state.docId || !state.selectedObjectId) return;

  const obj = state.pageObjects.find((o) => o.id === state.selectedObjectId);
  if (!obj) return;

  if (state.toolMode === 'edit-text' && obj.type === 'text') {
    openInPlaceTextEditor(obj);
  } else if (state.toolMode === 'replace-image' && obj.type === 'image') {
    handleReplaceImage(obj);
  } else if (obj.type === 'text') {
    // Auto-switch to text edit mode on double-click
    setToolMode('edit-text');
    openInPlaceTextEditor(obj);
  }
}

// ── In-place text editor ────────────────────────────────────────────

function openInPlaceTextEditor(obj: PageObject): void {
  // Remove any existing editor
  const existing = document.getElementById('in-place-editor');
  if (existing) existing.remove();

  const scale = state.zoomPercent / 100;

  const editor = document.createElement('div');
  editor.id = 'in-place-editor';
  editor.contentEditable = 'true';
  editor.className = 'in-place-text-editor';

  // Position over the object
  const x = obj.left * scale;
  const canvasTop = (overlayCanvas.height / scale - obj.top) * scale;
  const w = (obj.right - obj.left) * scale;
  const h = (obj.top - obj.bottom) * scale;

  editor.style.left = `${x}px`;
  editor.style.top = `${canvasTop}px`;
  editor.style.width = `${w}px`;
  editor.style.minHeight = `${h}px`;
  editor.style.fontSize = `${12 * scale}px`;

  // Pre-fill with the object's current text content
  const originalText = obj.text ?? '';
  editor.textContent = originalText;

  const commitEdit = async (): Promise<void> => {
    const newText = editor.textContent?.trim() ?? '';
    editor.remove();
    if (!newText || !state.docId) return;

    const docId = state.docId;
    const pageIndex = state.currentPage;
    const objectId = obj.id;

    const cmd: EditCommand = {
      description: `Edit text object ${objectId}`,
      async execute(): Promise<void> {
        await window.api.pdf.editText({ docId, pageIndex, objectId, newText });
        markDirty();
        await renderCurrentPage();
      },
      async undo(): Promise<void> {
        await window.api.pdf.editText({ docId, pageIndex, objectId, newText: originalText });
        markDirty();
        await renderCurrentPage();
      },
    };

    await undoStack.push(cmd);
  };

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === 'Escape') {
      editor.remove();
    }
  });

  editor.addEventListener('blur', () => {
    // Commit on blur (unless already removed by Escape)
    if (editor.parentElement) commitEdit();
  });

  viewerContainer.appendChild(editor);
  editor.focus();

  // Select all text for easy replacement
  const range = document.createRange();
  range.selectNodeContents(editor);
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

// ── Image replacement ───────────────────────────────────────────────

async function handleReplaceImage(obj: PageObject): Promise<void> {
  if (!state.docId) return;

  // Create a file input to pick the replacement image
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg';

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    const format: 'png' | 'jpeg' = file.type === 'image/png' ? 'png' : 'jpeg';
    const arrayBuf = await file.arrayBuffer();
    const imageData = new Uint8Array(arrayBuf);

    const docId = state.docId!;
    const pageIndex = state.currentPage;
    const objectId = obj.id;

    // For undo we'd need the original image data — simplified for now
    const cmd: EditCommand = {
      description: `Replace image object ${objectId}`,
      async execute(): Promise<void> {
        await window.api.pdf.replaceImage({ docId, pageIndex, objectId, image: imageData, format });
        markDirty();
        await renderCurrentPage();
      },
      async undo(): Promise<void> {
        // TODO: Store original image for true undo — for now just re-render
        setStatus('Image undo not fully supported yet');
        await renderCurrentPage();
      },
    };

    await undoStack.push(cmd);
  });

  input.click();
}

// ── Tool mode ───────────────────────────────────────────────────────

function setToolMode(mode: ToolMode): void {
  state.toolMode = mode;
  btnToolSelect.classList.toggle('active', mode === 'select');
  btnToolEditText.classList.toggle('active', mode === 'edit-text');
  btnToolReplaceImage.classList.toggle('active', mode === 'replace-image');
  overlayCanvas.style.cursor = mode === 'select' ? 'default' : 'crosshair';
}

// ── Properties panel ────────────────────────────────────────────────

function updatePropertiesPanel(obj: PageObject | null): void {
  const panel = document.getElementById('properties-panel');
  if (!panel) return;

  if (!obj) {
    panel.innerHTML = '<p class="placeholder">Properties</p>';
    return;
  }

  panel.innerHTML = `
    <div class="properties-content">
      <h4>Object #${obj.id}</h4>
      <p><strong>Type:</strong> ${obj.type}</p>
      <p><strong>Bounds:</strong></p>
      <p class="indent">L: ${obj.left.toFixed(1)}, T: ${obj.top.toFixed(1)}</p>
      <p class="indent">R: ${obj.right.toFixed(1)}, B: ${obj.bottom.toFixed(1)}</p>
      <p><strong>Size:</strong> ${(obj.right - obj.left).toFixed(1)} × ${(obj.top - obj.bottom).toFixed(1)} pt</p>
    </div>
  `;
}

// ── Dirty state ─────────────────────────────────────────────────────

function markDirty(): void {
  state.modified = true;
  updateDirtyIndicator();
}

function updateDirtyIndicator(): void {
  dirtyIndicator.style.display = state.modified ? 'inline' : 'none';
  const fileName = fileNameEl.textContent ?? '';
  const titleBase = fileName.replace(/^\*\s*/, '');
  document.title = state.modified
    ? `* ${titleBase} — PDF Editor`
    : `${titleBase} — PDF Editor`;
}

// ── Keyboard shortcuts ──────────────────────────────────────────────

function handleKeyboard(e: KeyboardEvent): void {
  const mod = e.ctrlKey || e.metaKey;

  // File operations
  if (mod && e.key === 'o') { e.preventDefault(); handleOpen(); }
  if (mod && !e.shiftKey && e.key === 's') { e.preventDefault(); handleSave(); }
  if (mod && e.shiftKey && e.key === 'S') { e.preventDefault(); handleSaveAs(); }

  // Undo / redo
  if (mod && !e.shiftKey && e.key === 'z') { e.preventDefault(); undoStack.undo(); }
  if (mod && e.shiftKey && e.key === 'Z') { e.preventDefault(); undoStack.redo(); }

  // Zoom
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom(state.zoomPercent + ZOOM_STEP_PERCENT); }
  if (mod && e.key === '-') { e.preventDefault(); setZoom(state.zoomPercent - ZOOM_STEP_PERCENT); }
  if (mod && e.key === '0') { e.preventDefault(); setZoom(DEFAULT_ZOOM_PERCENT); }

  // Page navigation
  if (e.key === 'PageUp') { e.preventDefault(); goToPage(state.currentPage - 1); }
  if (e.key === 'PageDown') { e.preventDefault(); goToPage(state.currentPage + 1); }
  if (e.key === 'Home' && mod) { e.preventDefault(); goToPage(0); }
  if (e.key === 'End' && mod) { e.preventDefault(); goToPage(state.pageCount - 1); }

  // Tool shortcuts
  if (e.key === 'v' && !mod) { setToolMode('select'); }
  if (e.key === 't' && !mod) { setToolMode('edit-text'); }
  if (e.key === 'i' && !mod) { setToolMode('replace-image'); }

  // Escape deselects
  if (e.key === 'Escape') {
    state.selectedObjectId = null;
    drawSelectionOverlay();
    updatePropertiesPanel(null);
  }
}

// ── UI Helpers ──────────────────────────────────────────────────────

function enableDocumentControls(): void {
  btnSave.disabled = false;
  btnSaveAs.disabled = false;
  btnZoomIn.disabled = false;
  btnZoomOut.disabled = false;
  btnZoomFit.disabled = false;
  btnPrevPage.disabled = false;
  btnNextPage.disabled = false;
  pageInput.disabled = false;
  btnToolSelect.disabled = false;
  btnToolEditText.disabled = false;
  btnToolReplaceImage.disabled = false;
}

function updatePageInfo(): void {
  pageInput.value = String(state.currentPage + 1);
  pageInput.max = String(state.pageCount);
  pageTotalEl.textContent = `/ ${state.pageCount}`;
  pageInfo.textContent = `Page ${state.currentPage + 1} of ${state.pageCount}`;
  btnPrevPage.disabled = state.currentPage === 0;
  btnNextPage.disabled = state.currentPage >= state.pageCount - 1;
}

function updateZoomInfo(): void {
  zoomLevelEl.textContent = `${state.zoomPercent}%`;
  zoomInfoEl.textContent = `Zoom: ${state.zoomPercent}%`;
  btnZoomIn.disabled = state.zoomPercent >= MAX_ZOOM_PERCENT;
  btnZoomOut.disabled = state.zoomPercent <= MIN_ZOOM_PERCENT;
}

function setStatus(text: string): void {
  statusText.textContent = text;
}

// ── Boot ────────────────────────────────────────────────────────────
init().catch((err) => {
  console.error('[Renderer] Init failed:', err);
  setStatus('Initialization error');
});
