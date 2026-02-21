/**
 * addon.cc — N-API module entry point for the PDFium addon.
 *
 * Registers all exported functions and manages PDFium library lifecycle.
 */

#include "common.h"
#include "document.h"
#include "render.h"
#include "objects.h"

#include <fpdf_edit.h>

// ── Global state definitions ────────────────────────────────────────

std::map<int, FPDF_DOCUMENT> g_documents;
std::map<int, std::map<int, CachedPage>> g_pageCache;
int g_nextHandle = 1;
bool g_initialized = false;

// ── PDFium library lifecycle ────────────────────────────────────────

void EnsurePdfiumInit() {
  if (g_initialized) return;

  FPDF_LIBRARY_CONFIG config;
  config.version = 2;
  config.m_pUserFontPaths = nullptr;
  config.m_pIsolate = nullptr;
  config.m_v8EmbedderSlot = 0;

  FPDF_InitLibraryWithConfig(&config);
  g_initialized = true;
}

FPDF_DOCUMENT RequireDocument(Napi::Env env, int handle) {
  auto it = g_documents.find(handle);
  if (it == g_documents.end()) {
    Napi::Error::New(
      env,
      "Invalid document handle: " + std::to_string(handle)
    ).ThrowAsJavaScriptException();
    return nullptr;
  }
  return it->second;
}

// ── Page cache helpers ──────────────────────────────────────────────

FPDF_PAGE AcquirePage(int handle, FPDF_DOCUMENT doc, int pageIndex,
                       bool& fromCache) {
  auto docIt = g_pageCache.find(handle);
  if (docIt != g_pageCache.end()) {
    auto pgIt = docIt->second.find(pageIndex);
    if (pgIt != docIt->second.end()) {
      fromCache = true;
      return pgIt->second.page;
    }
  }
  fromCache = false;
  return FPDF_LoadPage(doc, pageIndex);
}

void ReleasePage(int handle, int pageIndex, FPDF_PAGE page, bool fromCache) {
  // Cached pages stay open; non-cached pages are closed immediately.
  if (!fromCache) {
    FPDF_ClosePage(page);
  }
}

void CachePageDirty(int handle, int pageIndex, FPDF_PAGE page) {
  g_pageCache[handle][pageIndex] = { page, true };
}

bool FlushAndCloseCachedPages(int handle) {
  auto docIt = g_pageCache.find(handle);
  if (docIt == g_pageCache.end()) return true;

  bool allOk = true;
  for (auto& [idx, cp] : docIt->second) {
    if (cp.dirty) {
      if (!FPDFPage_GenerateContent(cp.page)) {
        allOk = false;
      }
    }
    FPDF_ClosePage(cp.page);
  }
  g_pageCache.erase(docIt);
  return allOk;
}

void DiscardCachedPages(int handle) {
  auto docIt = g_pageCache.find(handle);
  if (docIt == g_pageCache.end()) return;

  for (auto& [idx, cp] : docIt->second) {
    FPDF_ClosePage(cp.page);
  }
  g_pageCache.erase(docIt);
}

/**
 * Cleanup hook — called when the Node.js environment is torn down.
 * Closes all open documents and destroys the PDFium library.
 */
static void Cleanup(void* /*arg*/) {
  // Close all cached pages before closing documents
  for (auto& [handle, pages] : g_pageCache) {
    for (auto& [idx, cp] : pages) {
      FPDF_ClosePage(cp.page);
    }
  }
  g_pageCache.clear();

  for (auto& [id, doc] : g_documents) {
    FPDF_CloseDocument(doc);
  }
  g_documents.clear();

  if (g_initialized) {
    FPDF_DestroyLibrary();
    g_initialized = false;
  }
}

// ── Module initialisation ───────────────────────────────────────────

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  // Document lifecycle
  exports.Set("openDocument",
    Napi::Function::New(env, OpenDocument));
  exports.Set("closeDocument",
    Napi::Function::New(env, CloseDocument));
  exports.Set("getPageCount",
    Napi::Function::New(env, GetPageCount));
  exports.Set("saveDocument",
    Napi::Function::New(env, SaveDocument));

  // Rendering
  exports.Set("renderPage",
    Napi::Function::New(env, RenderPage));

  // Object inspection & editing
  exports.Set("listPageObjects",
    Napi::Function::New(env, ListPageObjects));
  exports.Set("editTextObject",
    Napi::Function::New(env, EditTextObject));
  exports.Set("replaceImageObject",
    Napi::Function::New(env, ReplaceImageObject));
  exports.Set("replaceImageObjectBitmap",
    Napi::Function::New(env, ReplaceImageObjectBitmap));

  // Register cleanup hook for process exit
  napi_add_env_cleanup_hook(env, Cleanup, nullptr);

  return exports;
}

NODE_API_MODULE(pdfium, Init)
