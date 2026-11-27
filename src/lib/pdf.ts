import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
// El visor de PDF.js (pdf_viewer.mjs) espera la librería en globalThis
;(globalThis as unknown as { pdfjsLib: typeof pdfjsLib }).pdfjsLib = pdfjsLib

const assets = new URL('pdfjs/', new URL(import.meta.env.BASE_URL, window.location.href)).href

export function loadPdf(data: ArrayBuffer) {
  return pdfjsLib.getDocument({
    data,
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`,
    iccUrl: `${assets}iccs/`,
  }).promise
}

export type { PDFDocumentProxy } from 'pdfjs-dist'
