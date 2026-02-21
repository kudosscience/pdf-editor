/**
 * render.cc — Render a PDF page to an RGBA bitmap via PDFium.
 */

#include "common.h"
#include "render.h"

#include <fpdfview.h>

#include <algorithm>
#include <cstdint>
#include <string>

/** Render flags: include annotations, sub-pixel text, printing fidelity. */
static constexpr int RENDER_FLAGS = FPDF_ANNOT | FPDF_PRINTING | FPDF_LCD_TEXT;

Napi::Value RenderPage(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // ── Validate arguments ──────────────────────────────────────────
  if (info.Length() < 3 ||
      !info[0].IsNumber() ||
      !info[1].IsNumber() ||
      !info[2].IsNumber()) {
    Napi::TypeError::New(env,
      "renderPage: requires (handle: number, pageIndex: number, scale: number)"
    ).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  int handle      = info[0].As<Napi::Number>().Int32Value();
  int pageIndex   = info[1].As<Napi::Number>().Int32Value();
  double scale    = info[2].As<Napi::Number>().DoubleValue();

  FPDF_DOCUMENT doc = RequireDocument(env, handle);
  if (!doc) return env.Undefined();

  int pageCount = FPDF_GetPageCount(doc);
  if (pageIndex < 0 || pageIndex >= pageCount) {
    Napi::RangeError::New(env,
      "renderPage: pageIndex " + std::to_string(pageIndex) +
      " out of range [0, " + std::to_string(pageCount - 1) + "]"
    ).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (scale <= 0.0) {
    Napi::RangeError::New(env, "renderPage: scale must be > 0")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // ── Load page ───────────────────────────────────────────────────
  bool fromCache = false;
  FPDF_PAGE page = AcquirePage(handle, doc, pageIndex, fromCache);
  if (!page) {
    Napi::Error::New(env,
      "renderPage: failed to load page " + std::to_string(pageIndex)
    ).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Page dimensions in PDF points (1 pt = 1/72 inch)
  double pageWidthPt  = FPDF_GetPageWidthF(page);
  double pageHeightPt = FPDF_GetPageHeightF(page);

  // Scaled pixel dimensions
  int width  = static_cast<int>(pageWidthPt  * scale + 0.5);
  int height = static_cast<int>(pageHeightPt * scale + 0.5);

  if (width <= 0 || height <= 0) {
    ReleasePage(handle, pageIndex, page, fromCache);
    Napi::Error::New(env, "renderPage: resulting bitmap size is zero")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // ── Create bitmap and render ────────────────────────────────────
  // Format 4 = FPDFBitmap_BGRA (Blue-Green-Red-Alpha, 4 bytes/pixel)
  FPDF_BITMAP bitmap = FPDFBitmap_Create(width, height, /*alpha=*/1);
  if (!bitmap) {
    ReleasePage(handle, pageIndex, page, fromCache);
    Napi::Error::New(env, "renderPage: FPDFBitmap_Create failed")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Fill with opaque white background (ARGB 0xFFFFFFFF)
  FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xFFFFFFFF);

  // Render the page onto the bitmap
  FPDF_RenderPageBitmap(
    bitmap, page,
    /*start_x=*/0, /*start_y=*/0,
    /*size_x=*/width, /*size_y=*/height,
    /*rotation=*/0,
    RENDER_FLAGS
  );

  // ── Convert BGRA → RGBA and copy to Node Buffer ────────────────
  uint8_t* src    = static_cast<uint8_t*>(FPDFBitmap_GetBuffer(bitmap));
  int      stride = FPDFBitmap_GetStride(bitmap);

  // Tightly-packed RGBA: width * 4 bytes per row
  const size_t BYTES_PER_PIXEL = 4;
  size_t tightStride = static_cast<size_t>(width) * BYTES_PER_PIXEL;
  size_t dataSize    = tightStride * static_cast<size_t>(height);

  auto resultBuf = Napi::Buffer<uint8_t>::New(env, dataSize);
  uint8_t* dst = resultBuf.Data();

  for (int y = 0; y < height; y++) {
    const uint8_t* srcRow = src + static_cast<size_t>(y) * stride;
    uint8_t*       dstRow = dst + static_cast<size_t>(y) * tightStride;

    for (int x = 0; x < width; x++) {
      size_t si = static_cast<size_t>(x) * BYTES_PER_PIXEL;
      size_t di = si; // same offset in tightly-packed row

      dstRow[di + 0] = srcRow[si + 2]; // R ← B
      dstRow[di + 1] = srcRow[si + 1]; // G ← G
      dstRow[di + 2] = srcRow[si + 0]; // B ← R
      dstRow[di + 3] = srcRow[si + 3]; // A ← A
    }
  }

  // ── Cleanup PDFium resources ────────────────────────────────────
  FPDFBitmap_Destroy(bitmap);
  ReleasePage(handle, pageIndex, page, fromCache);

  // ── Build result object ─────────────────────────────────────────
  Napi::Object result = Napi::Object::New(env);
  result.Set("data",   resultBuf);
  result.Set("width",  Napi::Number::New(env, width));
  result.Set("height", Napi::Number::New(env, height));
  return result;
}
