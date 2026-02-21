/**
 * common.h — Shared state and utilities for the PDFium N-API addon.
 */
#ifndef PDFIUM_ADDON_COMMON_H
#define PDFIUM_ADDON_COMMON_H

#include <napi.h>
#include <fpdfview.h>
#include <map>

// ── Global document registry ────────────────────────────────────────

/** Maps integer handle → FPDF_DOCUMENT. */
extern std::map<int, FPDF_DOCUMENT> g_documents;

/** Monotonically increasing handle counter. */
extern int g_nextHandle;

/** Whether FPDF_InitLibraryWithConfig has been called. */
extern bool g_initialized;

// ── Page cache ──────────────────────────────────────────────────────

/**
 * A page that has been kept open after editing.
 *
 * Calling FPDFPage_GenerateContent immediately after an edit corrupts
 * the content stream for pages that use subset fonts or TJ-based word
 * spacing.  Instead we keep the page open so that subsequent renders
 * use the correct in-memory objects, and we only regenerate content
 * immediately before FPDF_SaveAsCopy.
 */
struct CachedPage {
  FPDF_PAGE page;
  bool      dirty;   ///< Needs FPDFPage_GenerateContent before save.
};

/** handle → (pageIndex → CachedPage). */
extern std::map<int, std::map<int, CachedPage>> g_pageCache;

// ── Utility functions ───────────────────────────────────────────────

/**
 * Ensure the PDFium library is initialised.
 * Safe to call multiple times; only the first call has an effect.
 */
void EnsurePdfiumInit();

/**
 * Look up a document handle in the registry.
 * Throws a JS Error and returns nullptr if not found.
 */
FPDF_DOCUMENT RequireDocument(Napi::Env env, int handle);

/**
 * Return a cached FPDF_PAGE if one exists for (handle, pageIndex),
 * otherwise load a fresh one via FPDF_LoadPage.
 * Sets *fromCache = true when the returned page was already cached.
 */
FPDF_PAGE AcquirePage(int handle, FPDF_DOCUMENT doc, int pageIndex,
                       bool& fromCache);

/**
 * Release a page obtained from AcquirePage.
 * If the page is in the cache it is kept open; otherwise it is closed.
 */
void ReleasePage(int handle, int pageIndex, FPDF_PAGE page, bool fromCache);

/**
 * Insert (or update) a page in the cache and mark it dirty.
 * Called after an edit operation that modifies an in-memory page object.
 */
void CachePageDirty(int handle, int pageIndex, FPDF_PAGE page);

/**
 * Call FPDFPage_GenerateContent on every dirty cached page for the
 * given document handle, then close all cached pages.
 * Returns false if any GenerateContent call fails.
 */
bool FlushAndCloseCachedPages(int handle);

/**
 * Close (and discard) all cached pages for a document without
 * generating content — used when closing a document without saving.
 */
void DiscardCachedPages(int handle);

#endif // PDFIUM_ADDON_COMMON_H

