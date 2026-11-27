// OCR local con Tesseract.js (motor WASM + modelo de español servidos desde la propia app).
// Las imágenes nunca salen del dispositivo.
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import { loadPdf } from './pdf'
import { binarize, clearBorder, estimateSkew, toGray, type Rect } from './imageproc'

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

/** Escala, endereza y binariza un ticket para el OCR. */
function preprocess(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number): HTMLCanvasElement {
  // Altura de letra objetivo ~35 px: los tickets se llevan a ~1500 px de ancho
  const scale = Math.min(Math.max(1500 / sw, 0.5), 3.5, 7000 / sh)
  const w = Math.round(sw * scale)
  const h = Math.round(sh * scale)

  // 1) Estimar la inclinación en una copia pequeña
  const small = document.createElement('canvas')
  const ss = Math.min(1, 500 / sw)
  small.width = Math.max(1, Math.round(sw * ss))
  small.height = Math.max(1, Math.round(sh * ss))
  const sctx = small.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(source, sx, sy, sw, sh, 0, 0, small.width, small.height)
  const sg = toGray(sctx.getImageData(0, 0, small.width, small.height).data, small.width, small.height)
  const skew = estimateSkew(binarize(sg, small.width, small.height), small.width, small.height)

  // 2) Escalar y rotar a tamaño completo (fondo blanco)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(w / 2, h / 2)
  ctx.rotate((-skew * Math.PI) / 180)
  ctx.drawImage(source, sx, sy, sw, sh, -w / 2, -h / 2, w, h)
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  // 3) Binarización adaptativa
  const img = ctx.getImageData(0, 0, w, h)
  const bin = binarize(toGray(img.data, w, h), w, h, Math.round(w / 16))
  clearBorder(bin, w, h)
  const d = img.data
  for (let p = 0, i = 0; p < bin.length; p++, i += 4) {
    d[i] = d[i + 1] = d[i + 2] = bin[p]
    d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

async function recognizeCanvas(canvas: HTMLCanvasElement, progress: Progress): Promise<string> {
  onProgress = (stage, v) => progress(stage, v / 2)
  const worker = await getWorker()
  const first = (await worker.recognize(canvas)).data.text
  // Segunda lectura con la imagen aplastada en vertical
  const half = document.createElement('canvas')
  // Solo se reduce la altura: la letra alta y condensada de las líneas de TOTAL recupera proporciones normales
  half.width = canvas.width
  half.height = Math.round(canvas.height / 2)
  const hctx = half.getContext('2d')!
  hctx.imageSmoothingQuality = 'high'
  hctx.drawImage(canvas, 0, 0, half.width, half.height)
  onProgress = (stage, v) => progress(stage, 0.5 + v / 2)
  const second = (await worker.recognize(half)).data.text
  onProgress = null
  return `${first.trim()}\n${SECOND_PASS}\n${second.trim()}`
}

export const SECOND_PASS = '----- 2ª lectura (letra alta) -----'

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

/**
 * OCR de una foto. Con `rect` (en píxeles de la imagen original) solo se lee esa zona:
 * sirve para fotos con varios tickets.
 */
export async function readImage(file: Blob, progress: Progress, rect?: Rect): Promise<OcrResult> {
  progress('Preparando imagen', 0)
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const r = rect ?? { x: 0, y: 0, w: bmp.width, h: bmp.height }
    const canvas = preprocess(bmp, r.x, r.y, r.w, r.h)
    const crop = document.createElement('canvas')
    crop.width = Math.round(r.w)
    crop.height = Math.round(r.h)
    crop.getContext('2d')!.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, crop.width, crop.height)
    const text = await recognizeCanvas(canvas, progress)
    return { text, preview: crop.toDataURL('image/jpeg', 0.85), thumb: thumbnail(crop, crop.width, crop.height), source: 'ocr' }
  } finally {
    bmp.close()
  }
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
        texts.push(await recognizeCanvas(preprocess(canvas, 0, 0, canvas.width, canvas.height), (s, v) =>
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
