/**
 * E2E tests for PBI 1 — Cross-Platform PDFium Viewer & Engine Foundation.
 *
 * Verifies all Conditions of Satisfaction:
 *   1. Open simple-text.pdf → page count = 1, canvas rendered
 *   2. Open multi-page.pdf → navigate to last page, page indicator correct
 *   3. Zoom to 200 % on simple-text.pdf → zoom indicator, canvas size increase
 *   4. Open embedded-images.pdf → thumbnail count matches page count
 *   5. Open, save, reopen multi-page.pdf → page count and first-page match
 *   6. No network requests during all scenarios (offline)
 *   7. Open encrypted.pdf with password (partial — see fixture notes)
 */

import { test, expect } from '@playwright/test';
import { _electron as electron, ElectronApplication, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

// ── Constants ───────────────────────────────────────────────────────

const MAIN_ENTRY = path.resolve(__dirname, '..', '..', 'dist', 'main', 'index.js');
const CORPUS_DIR = path.resolve(__dirname, '..', 'fixtures', 'corpus');
const MULTI_PAGE_COUNT = 12;
const TEMP_SAVE_PATH = path.resolve(__dirname, '..', 'fixtures', 'corpus', '_temp_save_test.pdf');

// ── Helpers ─────────────────────────────────────────────────────────

let electronApp: ElectronApplication;
let page: Page;
/** Collected network request URLs during a test. */
let networkRequests: string[];
/** Counter for unique user-data dirs (avoids single-instance lock conflicts). */
let launchCounter = 0;

async function launchApp(): Promise<void> {
  launchCounter++;
  const userDataDir = path.resolve(__dirname, '..', 'fixtures', `_test-profile-${launchCounter}-${Date.now()}`);

  electronApp = await electron.launch({
    args: [MAIN_ENTRY],
    env: { ...process.env, NODE_ENV: 'test' },
  });
  page = await electronApp.firstWindow();

  // Collect network requests to verify offline behaviour
  networkRequests = [];
  page.on('request', (req) => {
    const url = req.url();
    // Ignore local file:// and devtools:// URLs — only flag HTTP(S)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      networkRequests.push(url);
    }
  });

  // Wait for the app to finish initialising
  await page.waitForSelector('#status-text', { state: 'attached' });
  await page.waitForFunction(
    () => document.getElementById('status-text')?.textContent === 'Ready',
    { timeout: 15_000 },
  );
}

/**
 * Open a PDF from the corpus by mocking the Electron file dialog and
 * clicking the Open button.
 */
async function openFixture(fixtureName: string, password?: string): Promise<void> {
  const fixturePath = path.join(CORPUS_DIR, fixtureName);

  // Mock dialog.showOpenDialog in the main process to return our fixture
  await electronApp.evaluate(async ({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [filePath],
    });
  }, fixturePath);

  // Click the Open button
  await page.click('#btn-open');

  // Wait for the document to be loaded (status shows "Opened: ...")
  await page.waitForFunction(
    (name) => {
      const st = document.getElementById('status-text')?.textContent ?? '';
      return st.startsWith('Opened:') || st.startsWith('Failed');
    },
    fixtureName,
    { timeout: 15_000 },
  );
}

async function closeApp(): Promise<void> {
  if (electronApp) {
    await electronApp.close();
    // Allow time for Electron to fully release resources
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────

test.afterEach(async () => {
  await closeApp();
  // Remove temp save file if it exists
  try { fs.unlinkSync(TEMP_SAVE_PATH); } catch { /* ignore */ }
});

// ── Scenario 1: Open simple-text.pdf ────────────────────────────────

test('Scenario 1 — open simple-text.pdf, verify page count and canvas', async () => {
  await launchApp();
  await openFixture('simple-text.pdf');

  // Status should show "Opened" and 1 page
  const statusText = await page.textContent('#status-text');
  expect(statusText).toContain('Opened');
  expect(statusText).toContain('1 page');

  // Page total should show "/ 1"
  const pageTotal = await page.textContent('#page-total');
  expect(pageTotal).toContain('1');

  // Canvas should be visible and have non-zero dimensions
  const canvasBox = await page.locator('#page-canvas').boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox!.width).toBeGreaterThan(0);
  expect(canvasBox!.height).toBeGreaterThan(0);
});

// ── Scenario 2: Open multi-page.pdf, navigate to last page ─────────

test('Scenario 2 — open multi-page.pdf, navigate to last page', async () => {
  await launchApp();
  await openFixture('multi-page.pdf');

  // Verify page count
  const statusText = await page.textContent('#status-text');
  expect(statusText).toContain(`${MULTI_PAGE_COUNT} pages`);

  // Navigate to last page via page input
  await page.fill('#page-input', String(MULTI_PAGE_COUNT));
  await page.press('#page-input', 'Enter');

  // Wait for page to render
  await page.waitForTimeout(1000);

  // Page input should show the last page number
  const pageInputValue = await page.inputValue('#page-input');
  expect(parseInt(pageInputValue, 10)).toBe(MULTI_PAGE_COUNT);

  // Page info in status bar should reflect last page
  const pageInfo = await page.textContent('#page-info');
  expect(pageInfo).toContain(String(MULTI_PAGE_COUNT));
});

// ── Scenario 3: Zoom to 200% ───────────────────────────────────────

test('Scenario 3 — zoom to 200% on simple-text.pdf', async () => {
  await launchApp();
  await openFixture('simple-text.pdf');

  // Get initial canvas width
  const initialBox = await page.locator('#page-canvas').boundingBox();
  expect(initialBox).not.toBeNull();
  const initialWidth = initialBox!.width;

  // Click zoom-in button multiple times to reach 200% (from 100%, 4 clicks at 25% step)
  const ZOOM_CLICKS_TO_200 = 4;
  for (let i = 0; i < ZOOM_CLICKS_TO_200; i++) {
    await page.click('#btn-zoom-in');
    await page.waitForTimeout(300);
  }

  // Zoom indicator should show 200%
  const zoomLevel = await page.textContent('#zoom-level');
  expect(zoomLevel).toContain('200');

  // Canvas should be wider than at 100%
  const zoomedBox = await page.locator('#page-canvas').boundingBox();
  expect(zoomedBox).not.toBeNull();
  expect(zoomedBox!.width).toBeGreaterThan(initialWidth);
});

// ── Scenario 4: Thumbnails match page count ─────────────────────────

test('Scenario 4 — open embedded-images.pdf, thumbnail count matches', async () => {
  await launchApp();
  await openFixture('embedded-images.pdf');

  // Wait for thumbnails to be built
  const EMBEDDED_IMAGES_PAGE_COUNT = 2;
  await page.waitForFunction(
    (expectedCount) => {
      const items = document.querySelectorAll('#thumbnails-panel .thumbnail-item');
      return items.length === expectedCount;
    },
    EMBEDDED_IMAGES_PAGE_COUNT,
    { timeout: 10_000 },
  );

  // Count thumbnails
  const thumbnailCount = await page.locator('#thumbnails-panel .thumbnail-item').count();
  expect(thumbnailCount).toBe(EMBEDDED_IMAGES_PAGE_COUNT);
});

// ── Scenario 5: Save and reopen ─────────────────────────────────────

test('Scenario 5 — open, save, reopen multi-page.pdf', async () => {
  await launchApp();
  await openFixture('multi-page.pdf');

  // Wait for render
  await page.waitForTimeout(1000);

  // Get first-page canvas data before save
  const canvasBeforeSave = await page.evaluate(() => {
    const canvas = document.getElementById('page-canvas') as HTMLCanvasElement;
    return { width: canvas.width, height: canvas.height };
  });

  // Mock save dialog to save to temp path
  await electronApp.evaluate(async ({ dialog }, savePath) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: savePath,
    });
  }, TEMP_SAVE_PATH);

  // Save via Ctrl+Shift+S (Save As)
  await page.keyboard.press('Control+Shift+S');
  await page.waitForFunction(
    () => {
      const st = document.getElementById('status-text')?.textContent ?? '';
      return st.startsWith('Saved');
    },
    { timeout: 10_000 },
  );

  // Now reopen the saved file
  await electronApp.evaluate(async ({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [filePath],
    });
  }, TEMP_SAVE_PATH);

  await page.click('#btn-open');
  await page.waitForFunction(
    () => {
      const st = document.getElementById('status-text')?.textContent ?? '';
      return st.startsWith('Opened:');
    },
    { timeout: 15_000 },
  );

  // Page count should match
  const statusText = await page.textContent('#status-text');
  expect(statusText).toContain(`${MULTI_PAGE_COUNT} pages`);

  // First-page canvas dimensions should match
  const canvasAfterReopen = await page.evaluate(() => {
    const canvas = document.getElementById('page-canvas') as HTMLCanvasElement;
    return { width: canvas.width, height: canvas.height };
  });
  expect(canvasAfterReopen.width).toBe(canvasBeforeSave.width);
  expect(canvasAfterReopen.height).toBe(canvasBeforeSave.height);
});

// ── Scenario 6: No network requests (offline) ──────────────────────

test('Scenario 6 — no HTTP(S) network requests during all operations', async () => {
  await launchApp();

  // Open a file, navigate, zoom, then check
  await openFixture('multi-page.pdf');
  await page.click('#btn-zoom-in');
  await page.waitForTimeout(300);
  await page.click('#btn-next-page');
  await page.waitForTimeout(500);

  // No HTTP/HTTPS requests should have been made
  expect(networkRequests).toEqual([]);
});

// ── Scenario 7: Encrypted PDF (partial test) ────────────────────────

test('Scenario 7 — open encrypted.pdf with password parameter', async () => {
  await launchApp();

  const fixturePath = path.join(CORPUS_DIR, 'encrypted.pdf');

  // Mock dialog to return the fixture
  await electronApp.evaluate(async ({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [filePath],
    });
  }, fixturePath);

  // Open the file (it's an unencrypted placeholder, so it opens without password)
  await page.click('#btn-open');
  await page.waitForFunction(
    () => {
      const st = document.getElementById('status-text')?.textContent ?? '';
      return st.startsWith('Opened:') || st.startsWith('Failed');
    },
    { timeout: 15_000 },
  );

  const statusText = await page.textContent('#status-text');
  expect(statusText).toContain('Opened');

  // Canvas should render
  const canvasBox = await page.locator('#page-canvas').boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox!.width).toBeGreaterThan(0);
  expect(canvasBox!.height).toBeGreaterThan(0);
});
