/**
 * objects.cc — Page object listing, text editing, image replacement.
 */

#include "common.h"
#include "objects.h"

#include <fpdfview.h>
#include <fpdf_edit.h>
#include <fpdf_text.h>

#include <cstring>
#include <string>
#include <vector>

// ── Object type name mapping ────────────────────────────────────────

static const char* GetObjectTypeName(int type) {
  switch (type) {
    case FPDF_PAGEOBJ_TEXT:    return "text";
    case FPDF_PAGEOBJ_PATH:    return "path";
    case FPDF_PAGEOBJ_IMAGE:   return "image";
    case FPDF_PAGEOBJ_SHADING: return "shading";
    case FPDF_PAGEOBJ_FORM:    return "form";
    default:                   return "unknown";
  }
}

// ── listPageObjects ─────────────────────────────────────────────────

Napi::Value ListPageObjects(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 ||
      !info[0].IsNumber() ||
      !info[1].IsNumber()) {
    Napi::TypeError::New(env,
      "listPageObjects: requires (handle: number, pageIndex: number)"
    ).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  int handle    = info[0].As<Napi::Number>().Int32Value();
  int pageIndex = info[1].As<Napi::Number>().Int32Value();

  FPDF_DOCUMENT doc = RequireDocument(env, handle);
  if (!doc) return env.Undefined();

  bool fromCache = false;
  FPDF_PAGE page = AcquirePage(handle, doc, pageIndex, fromCache);
  if (!page) {
    Napi::Error::New(env,
      "listPageObjects: failed to load page " + std::to_string(pageIndex)
    ).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  int objCount = FPDFPage_CountObjects(page);
  Napi::Array result = Napi::Array::New(env, static_cast<size_t>(objCount));

  // Load the text page once — needed by FPDFTextObj_GetText to extract
  // the Unicode content of text objects.
  FPDF_TEXTPAGE textPage = FPDFText_LoadPage(page);

  for (int i = 0; i < objCount; i++) {
    FPDF_PAGEOBJECT obj = FPDFPage_GetObject(page, i);
    int type = FPDFPageObj_GetType(obj);

    float left = 0.0f, bottom = 0.0f, right = 0.0f, top = 0.0f;
    FPDFPageObj_GetBounds(obj, &left, &bottom, &right, &top);

    Napi::Object entry = Napi::Object::New(env);
    entry.Set("id",     Napi::Number::New(env, i));
    entry.Set("type",   Napi::String::New(env, GetObjectTypeName(type)));
    entry.Set("left",   Napi::Number::New(env, static_cast<double>(left)));
    entry.Set("top",    Napi::Number::New(env, static_cast<double>(top)));
    entry.Set("right",  Napi::Number::New(env, static_cast<double>(right)));
    entry.Set("bottom", Napi::Number::New(env, static_cast<double>(bottom)));

    // Extract text content for text objects.
    if (type == FPDF_PAGEOBJ_TEXT && textPage) {
      // First call: get required buffer length (in bytes, UTF-16LE + NUL).
      unsigned long len = FPDFTextObj_GetText(obj, textPage, nullptr, 0);
      if (len > 0) {
        std::vector<unsigned short> buf(len / sizeof(unsigned short));
        FPDFTextObj_GetText(obj, textPage, buf.data(), len);
        // Convert UTF-16LE to Napi string (strip trailing NUL).
        size_t charCount = buf.size();
        if (charCount > 0 && buf[charCount - 1] == 0) charCount--;
        entry.Set("text", Napi::String::New(env,
          reinterpret_cast<const char16_t*>(buf.data()), charCount));
      } else {
        entry.Set("text", Napi::String::New(env, ""));
      }
    }

    result[static_cast<uint32_t>(i)] = entry;
  }

  if (textPage) FPDFText_ClosePage(textPage);

  ReleasePage(handle, pageIndex, page, fromCache);
  return result;
}

// ── editTextObject ──────────────────────────────────────────────────

void EditTextObject(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // editTextObject(handle, pageIndex, objectId, newText [, fontName, fontSize])
  if (info.Length() < 4 ||
      !info[0].IsNumber() ||
      !info[1].IsNumber() ||
      !info[2].IsNumber() ||
      !info[3].IsString()) {
    Napi::TypeError::New(env,
      "editTextObject: requires (handle, pageIndex, objectId, newText)"
    ).ThrowAsJavaScriptException();
    return;
  }

  int handle      = info[0].As<Napi::Number>().Int32Value();
  int pageIndex   = info[1].As<Napi::Number>().Int32Value();
  int objectId    = info[2].As<Napi::Number>().Int32Value();

  // Get text as UTF-16LE for PDFium's FPDF_WIDESTRING
  std::u16string newText = info[3].As<Napi::String>().Utf16Value();

  FPDF_DOCUMENT doc = RequireDocument(env, handle);
  if (!doc) return;

  // Use cached page if available (edited pages stay open).
  bool fromCache = false;
  FPDF_PAGE page = AcquirePage(handle, doc, pageIndex, fromCache);
  if (!page) {
    Napi::Error::New(env,
      "editTextObject: failed to load page " + std::to_string(pageIndex)
    ).ThrowAsJavaScriptException();
    return;
  }

  // Validate object ID
  int objCount = FPDFPage_CountObjects(page);
  if (objectId < 0 || objectId >= objCount) {
    ReleasePage(handle, pageIndex, page, fromCache);
    Napi::RangeError::New(env,
      "editTextObject: objectId " + std::to_string(objectId) +
      " out of range [0, " + std::to_string(objCount - 1) + "]"
    ).ThrowAsJavaScriptException();
    return;
  }

  FPDF_PAGEOBJECT obj = FPDFPage_GetObject(page, objectId);

  // Ensure it is a text object
  if (FPDFPageObj_GetType(obj) != FPDF_PAGEOBJ_TEXT) {
    ReleasePage(handle, pageIndex, page, fromCache);
    Napi::TypeError::New(env,
      "editTextObject: object " + std::to_string(objectId) + " is not a text object"
    ).ThrowAsJavaScriptException();
    return;
  }

  // Set text content (FPDF_WIDESTRING = const unsigned short* or const wchar_t*)
  FPDF_BOOL ok = FPDFText_SetText(
    obj,
    reinterpret_cast<FPDF_WIDESTRING>(newText.c_str())
  );

  if (!ok) {
    ReleasePage(handle, pageIndex, page, fromCache);
    Napi::Error::New(env, "editTextObject: FPDFText_SetText failed")
      .ThrowAsJavaScriptException();
    return;
  }

  // Do NOT call FPDFPage_GenerateContent here.
  // Regenerating the content stream on every edit corrupts pages that
  // use subset fonts or TJ-based word spacing.  Instead we keep the
  // page open so that renders use the correct in-memory objects, and
  // we defer GenerateContent to save time (FlushAndCloseCachedPages).
  CachePageDirty(handle, pageIndex, page);
}

// ── replaceImageObject ──────────────────────────────────────────────

/**
 * FPDF_FILEACCESS wrapper that reads from an in-memory buffer.
 * Used to hand JPEG data to FPDFImageObj_LoadJpegFileInline.
 */
struct BufferFileAccess {
  FPDF_FILEACCESS access;
  const uint8_t* data;
  unsigned long   size;
};

static int BufferReadBlock(
  void* param,
  unsigned long position,
  unsigned char* pBuf,
  unsigned long size
) {
  auto* bfa = static_cast<BufferFileAccess*>(param);
  if (position + size > bfa->size) return 0;
  std::memcpy(pBuf, bfa->data + position, size);
  return 1;
}

void ReplaceImageObject(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // replaceImageObject(handle, pageIndex, objectId, imageData, format)
  if (info.Length() < 5 ||
      !info[0].IsNumber() ||
      !info[1].IsNumber() ||
      !info[2].IsNumber() ||
      !info[3].IsBuffer() ||
      !info[4].IsString()) {
    Napi::TypeError::New(env,
      "replaceImageObject: requires "
      "(handle, pageIndex, objectId, imageData: Buffer, format: string)"
    ).ThrowAsJavaScriptException();
    return;
  }

  int handle      = info[0].As<Napi::Number>().Int32Value();
  int pageIndex   = info[1].As<Napi::Number>().Int32Value();
  int objectId    = info[2].As<Napi::Number>().Int32Value();
  auto imageData  = info[3].As<Napi::Buffer<uint8_t>>();
  std::string fmt = info[4].As<Napi::String>().Utf8Value();

  FPDF_DOCUMENT doc = RequireDocument(env, handle);
  if (!doc) return;

  bool fromCache = false;
  FPDF_PAGE page = AcquirePage(handle, doc, pageIndex, fromCache);
  if (!page) {
    Napi::Error::New(env,
      "replaceImageObject: failed to load page " + std::to_string(pageIndex)
    ).ThrowAsJavaScriptException();
    return;
  }

  int objCount = FPDFPage_CountObjects(page);
  if (objectId < 0 || objectId >= objCount) {
    ReleasePage(handle, pageIndex, page, fromCache);
    Napi::RangeError::New(env,
      "replaceImageObject: objectId " + std::to_string(objectId) +
      " out of range [0, " + std::to_string(objCount - 1) + "]"
    ).ThrowAsJavaScriptException();
    return;
  }

  FPDF_PAGEOBJECT obj = FPDFPage_GetObject(page, objectId);

  if (FPDFPageObj_GetType(obj) != FPDF_PAGEOBJ_IMAGE) {
    ReleasePage(handle, pageIndex, page, fromCache);
    Napi::TypeError::New(env,
      "replaceImageObject: object " + std::to_string(objectId) +
      " is not an image object"
    ).ThrowAsJavaScriptException();
    return;
  }

  FPDF_BOOL ok = 0;

  if (fmt == "jpeg") {
    // Embed JPEG data directly via FPDFImageObj_LoadJpegFileInline
    BufferFileAccess bfa;
    bfa.access.m_FileLen  = static_cast<unsigned long>(imageData.Length());
    bfa.access.m_GetBlock = BufferReadBlock;
    bfa.access.m_Param    = &bfa;
    bfa.data              = imageData.Data();
    bfa.size              = static_cast<unsigned long>(imageData.Length());

    ok = FPDFImageObj_LoadJpegFileInline(
      &page, /*count=*/1, obj, &bfa.access
    );
  } else {
    ReleasePage(handle, pageIndex, page, fromCache);
    Napi::Error::New(env,
      "replaceImageObject: only 'jpeg' format is currently supported. "
      "Convert other formats to JPEG before calling this function."
    ).ThrowAsJavaScriptException();
    return;
  }

  if (!ok) {
    ReleasePage(handle, pageIndex, page, fromCache);
    Napi::Error::New(env,
      "replaceImageObject: failed to load replacement image"
    ).ThrowAsJavaScriptException();
    return;
  }

  // Defer FPDFPage_GenerateContent to save time.
  CachePageDirty(handle, pageIndex, page);
}

// ── replaceImageObjectBitmap ────────────────────────────────────────

/**
 * Replace an image object with raw BGRA pixel data.
 * Uses FPDFBitmap_CreateEx + FPDFImageObj_SetBitmap for formats
 * that cannot go through the JPEG-inline path (e.g. PNG with alpha).
 */
void ReplaceImageObjectBitmap(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  // replaceImageObjectBitmap(handle, pageIndex, objectId, bgraData, width, height)
  if (info.Length() < 6 ||
      !info[0].IsNumber() ||
      !info[1].IsNumber() ||
      !info[2].IsNumber() ||
      !info[3].IsBuffer() ||
      !info[4].IsNumber() ||
      !info[5].IsNumber()) {
    Napi::TypeError::New(env,
      "replaceImageObjectBitmap: requires "
      "(handle, pageIndex, objectId, bgraData: Buffer, width, height)"
    ).ThrowAsJavaScriptException();
    return;
  }

  int handle      = info[0].As<Napi::Number>().Int32Value();
  int pageIndex   = info[1].As<Napi::Number>().Int32Value();
  int objectId    = info[2].As<Napi::Number>().Int32Value();
  auto bgraData   = info[3].As<Napi::Buffer<uint8_t>>();
  int width       = info[4].As<Napi::Number>().Int32Value();
  int height      = info[5].As<Napi::Number>().Int32Value();

  const int BYTES_PER_PIXEL = 4;  // BGRA
  int expectedSize = width * height * BYTES_PER_PIXEL;
  if (static_cast<int>(bgraData.Length()) < expectedSize) {
    Napi::RangeError::New(env,
      "replaceImageObjectBitmap: bgraData buffer too small. "
      "Expected " + std::to_string(expectedSize) + " bytes for " +
      std::to_string(width) + "x" + std::to_string(height) + " BGRA"
    ).ThrowAsJavaScriptException();
    return;
  }

  FPDF_DOCUMENT doc = RequireDocument(env, handle);
  if (!doc) return;

  bool fromCache = false;
  FPDF_PAGE page = AcquirePage(handle, doc, pageIndex, fromCache);
  if (!page) {
    Napi::Error::New(env,
      "replaceImageObjectBitmap: failed to load page " + std::to_string(pageIndex)
    ).ThrowAsJavaScriptException();
    return;
  }

  int objCount = FPDFPage_CountObjects(page);
  if (objectId < 0 || objectId >= objCount) {
    ReleasePage(handle, pageIndex, page, fromCache);
    Napi::RangeError::New(env,
      "replaceImageObjectBitmap: objectId " + std::to_string(objectId) +
      " out of range [0, " + std::to_string(objCount - 1) + "]"
    ).ThrowAsJavaScriptException();
    return;
  }

  FPDF_PAGEOBJECT obj = FPDFPage_GetObject(page, objectId);

  if (FPDFPageObj_GetType(obj) != FPDF_PAGEOBJ_IMAGE) {
    ReleasePage(handle, pageIndex, page, fromCache);
    Napi::TypeError::New(env,
      "replaceImageObjectBitmap: object " + std::to_string(objectId) +
      " is not an image object"
    ).ThrowAsJavaScriptException();
    return;
  }

  // Create an FPDF_BITMAP from the raw BGRA pixel data.
  // stride = width * 4 (BGRA, no padding)
  int stride = width * BYTES_PER_PIXEL;
  FPDF_BITMAP bitmap = FPDFBitmap_CreateEx(
    width, height, FPDFBitmap_BGRA,
    static_cast<void*>(bgraData.Data()), stride
  );

  if (!bitmap) {
    ReleasePage(handle, pageIndex, page, fromCache);
    Napi::Error::New(env,
      "replaceImageObjectBitmap: FPDFBitmap_CreateEx failed"
    ).ThrowAsJavaScriptException();
    return;
  }

  FPDF_BOOL ok = FPDFImageObj_SetBitmap(
    &page, /*count=*/1, obj, bitmap
  );

  FPDFBitmap_Destroy(bitmap);

  if (!ok) {
    ReleasePage(handle, pageIndex, page, fromCache);
    Napi::Error::New(env,
      "replaceImageObjectBitmap: FPDFImageObj_SetBitmap failed"
    ).ThrowAsJavaScriptException();
    return;
  }

  // Defer FPDFPage_GenerateContent to save time.
  CachePageDirty(handle, pageIndex, page);
}
