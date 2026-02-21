/**
 * document.cc — Document lifecycle: open, close, page count, save.
 */

#include "common.h"
#include "document.h"

#include <fpdfview.h>
#include <fpdf_save.h>

#include <cstring>
#include <string>
#include <vector>

// ── Error descriptions for FPDF_GetLastError() ─────────────────────

static const char* GetPdfiumErrorMessage(unsigned long err) {
  switch (err) {
    case FPDF_ERR_SUCCESS:  return "Success";
    case FPDF_ERR_UNKNOWN:  return "Unknown error";
    case FPDF_ERR_FILE:     return "File not found or could not be opened";
    case FPDF_ERR_FORMAT:   return "Invalid or corrupted PDF format";
    case FPDF_ERR_PASSWORD: return "Password required or incorrect password";
    case FPDF_ERR_SECURITY: return "Unsupported security scheme";
    case FPDF_ERR_PAGE:     return "Page not found or content error";
    default:                return "Unrecognised PDFium error";
  }
}

// ── openDocument ────────────────────────────────────────────────────

Napi::Value OpenDocument(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  EnsurePdfiumInit();

  // Validate: first argument must be a Buffer
  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env,
      "openDocument: first argument must be a Buffer"
    ).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  auto buffer = info[0].As<Napi::Buffer<uint8_t>>();
  const char* password = nullptr;
  std::string passwordStr;

  if (info.Length() > 1 && info[1].IsString()) {
    passwordStr = info[1].As<Napi::String>().Utf8Value();
    password = passwordStr.c_str();
  }

  FPDF_DOCUMENT doc = FPDF_LoadMemDocument(
    buffer.Data(),
    static_cast<int>(buffer.Length()),
    password
  );

  if (!doc) {
    unsigned long err = FPDF_GetLastError();
    Napi::Error::New(env, GetPdfiumErrorMessage(err))
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  int handle = g_nextHandle++;
  g_documents[handle] = doc;
  return Napi::Number::New(env, handle);
}

// ── closeDocument ───────────────────────────────────────────────────

void CloseDocument(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env,
      "closeDocument: argument must be a numeric handle"
    ).ThrowAsJavaScriptException();
    return;
  }

  int handle = info[0].As<Napi::Number>().Int32Value();
  auto it = g_documents.find(handle);

  if (it == g_documents.end()) {
    Napi::Error::New(env,
      "closeDocument: invalid handle " + std::to_string(handle)
    ).ThrowAsJavaScriptException();
    return;
  }

  // Discard any cached pages for this document before closing it.
  DiscardCachedPages(handle);

  FPDF_CloseDocument(it->second);
  g_documents.erase(it);
}

// ── getPageCount ────────────────────────────────────────────────────

Napi::Value GetPageCount(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env,
      "getPageCount: argument must be a numeric handle"
    ).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  int handle = info[0].As<Napi::Number>().Int32Value();
  FPDF_DOCUMENT doc = RequireDocument(env, handle);
  if (!doc) return env.Undefined();

  return Napi::Number::New(env, FPDF_GetPageCount(doc));
}

// ── saveDocument ────────────────────────────────────────────────────

/** Accumulates FPDF_SaveAsCopy output into a std::vector. */
struct BufferWriter {
  FPDF_FILEWRITE fileWrite;
  std::vector<uint8_t> data;
};

static int WriteBlockCallback(
  FPDF_FILEWRITE* pThis,
  const void* pData,
  unsigned long size
) {
  auto* writer = reinterpret_cast<BufferWriter*>(pThis);
  const auto* bytes = static_cast<const uint8_t*>(pData);
  writer->data.insert(writer->data.end(), bytes, bytes + size);
  return 1; // success
}

Napi::Value SaveDocument(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env,
      "saveDocument: argument must be a numeric handle"
    ).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  int handle = info[0].As<Napi::Number>().Int32Value();
  FPDF_DOCUMENT doc = RequireDocument(env, handle);
  if (!doc) return env.Undefined();

  BufferWriter writer;
  writer.fileWrite.version = 1;
  writer.fileWrite.WriteBlock = WriteBlockCallback;

  // Flush any cached dirty pages so their edits are written into the
  // content streams before we serialise the document.
  if (!FlushAndCloseCachedPages(handle)) {
    Napi::Error::New(env,
      "saveDocument: FPDFPage_GenerateContent failed for a dirty page")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  FPDF_BOOL ok = FPDF_SaveAsCopy(doc, &writer.fileWrite, 0);
  if (!ok) {
    Napi::Error::New(env, "saveDocument: FPDF_SaveAsCopy failed")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  return Napi::Buffer<uint8_t>::Copy(
    env, writer.data.data(), writer.data.size()
  );
}
