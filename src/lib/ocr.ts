// OCR local con Tesseract.js (motor WASM + modelo de español servidos desde la propia app).
// Las imágenes nunca salen del dispositivo.
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import { loadPdf } from './pdf'

const base = new URL('tesseract/', new URL(import.meta.env.BASE_URL, window.location.href)).href

export type Progress = (stage: string, value: number) => void

let workerPromise: Promise<Worker> | null = null
let onProgress: Progress | null = null

const STAGES: Record<string, string> = {
  'loading tesseract core': 'Cargando motor OCR',
  'initializing tesseract': 'Iniciando OCR',
  'loading language traineddata': 'Cargando idioma español',
  'initializing api': 'Preparando',
  'recognizing text': 'Reconociendo texto',
}

function getWorker() {
  workerPromise ??= (async () => {
    const worker = await createWorker('spa', OEM.LSTM_ONLY, {
      workerPath: `${base}worker.min.js`,
      corePath: `${base}core/`,
      langPath: `${base}lang/`,
      workerBlobURL: false,
      gzip: true,
      logger: (m) => onProgress?.(STAGES[m.status] ?? 'Procesando', m.progress),
    })
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK, // mantiene en la misma línea concepto e importe
      user_defined_dpi: '300',
      preserve_interword_spaces: '1',
    })
    return worker
  })().catch((e) => {
    workerPromise = null
    throw e
  })
  return workerPromise
}

/** Escala y mejora el contraste de la imagen para el OCR. */
function preprocess(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  // Los tickets suelen ser estrechos: se lleva el ancho a ~1600 px (sin pasar de 3000 px de alto x ancho razonable)
  const scale = Math.min(Math.max(1600 / width, 0.5), 3, 6000 / height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)

  // Escala de grises + estiramiento de niveles (percentiles 2 % y 98 %)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000
    d[i] = g
    hist[g | 0]++
  }
  const n = d.length / 4
  let lo = 0, hi = 255, acc = 0
  for (; lo < 255 && (acc += hist[lo]) < n * 0.02; lo++);
  acc = 0
  for (; hi > 0 && (acc += hist[hi]) < n * 0.02; hi--);
  const range = Math.max(hi - lo, 1)
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.min(255, Math.max(0, ((d[i] - lo) * 255) / range))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

async function recognizeCanvas(canvas: HTMLCanvasElement, progress: Progress): Promise<string> {
  onProgress = progress
  const worker = await getWorker()
  const { data } = await worker.recognize(canvas)
  onProgress = null
  return data.text
}

/** Miniatura JPEG para la lista de tickets. */
function thumbnail(source: CanvasImageSource, width: number, height: number): string {
  const w = 240
  const c = document.createElement('canvas')
  c.width = w
  c.height = Math.round((height / width) * w)
  c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.7)
}

export interface OcrResult {
  text: string
  preview: string // data URL de la imagen procesada (para mostrarla)
  thumb: string
  source: 'ocr' | 'pdf-text'
}

export async function readImage(file: Blob, progress: Progress): Promise<OcrResult> {
  progress('Preparando imagen', 0)
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const canvas = preprocess(bmp, bmp.width, bmp.height)
  const thumb = thumbnail(bmp, bmp.width, bmp.height)
  bmp.close()
  const text = await recognizeCanvas(canvas, progress)
  return { text, preview: canvas.toDataURL('image/jpeg', 0.85), thumb, source: 'ocr' }
}

const MAX_PDF_PAGES = 5

/** PDF: usa la capa de texto si existe (más fiable); si es un escaneo, hace OCR de cada página. */
export async function readPdf(file: Blob, progress: Progress): Promise<OcrResult> {
  progress('Abriendo PDF', 0)
  const doc = await loadPdf(await file.arrayBuffer())
  try {
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES)
    const texts: string[] = []
    let preview = ''
    let thumb = ''
    let usedOcr = false
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p)
      const base1 = page.getViewport({ scale: 1 })
      const vp = page.getViewport({ scale: Math.min(2000 / base1.width, 4) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(vp.width)
      canvas.height = Math.round(vp.height)
      await page.render({ canvas, viewport: vp }).promise
      if (p === 1) {
        preview = canvas.toDataURL('image/jpeg', 0.85)
        thumb = thumbnail(canvas, canvas.width, canvas.height)
      }
      const content = await page.getTextContent()
      const layerText = textFromContent(content.items as TextItem[])
      if (layerText.replace(/\s/g, '').length >= 20) {
        texts.push(layerText)
      } else {
        usedOcr = true
        texts.push(await recognizeCanvas(preprocess(canvas, canvas.width, canvas.height), (s, v) =>
          progress(pages > 1 ? `${s} (página ${p} de ${pages})` : s, v)))
      }
      page.cleanup()
    }
    return { text: texts.join('\n'), preview, thumb, source: usedOcr ? 'ocr' : 'pdf-text' }
  } finally {
    await doc.loadingTask.destroy()
  }
}

interface TextItem { str: string; transform: number[]; hasEOL?: boolean }

/** Reconstruye líneas a partir de los fragmentos de texto del PDF agrupando por coordenada Y. */
function textFromContent(items: TextItem[]): string {
  const rows: { y: number; parts: { x: number; s: string }[] }[] = []
  for (const it of items) {
    if (!('str' in it) || !it.str.trim()) continue
    const [, , , , x, y] = it.transform
    let row = rows.find((r) => Math.abs(r.y - y) < 3)
    if (!row) rows.push((row = { y, parts: [] }))
    row.parts.push({ x, s: it.str })
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join('  '))
    .join('\n')
}

export async function terminateOcr() {
  const w = await workerPromise
  workerPromise = null
  await w?.terminate()
}
