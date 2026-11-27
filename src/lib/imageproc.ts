// Procesado de imagen para OCR de tickets (sin dependencias):
// gris, binarización adaptativa, limpieza de bordes y enderezado.

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Gris 0-255 tomando el canal más claro de cada píxel: la tinta negra del ticket sigue oscura,
 * pero el rotulador fluorescente y los bolígrafos de color (subrayados, anotaciones) se vuelven claros.
 */
export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h)
  for (let i = 0, p = 0; p < g.length; i += 4, p++) {
    g[p] = Math.max(rgba[i], rgba[i + 1], rgba[i + 2])
  }
  return g
}

/**
 * Binarización adaptativa de Bradley-Roth con imagen integral: elimina sombras, el texto
 * transparentado del reverso y el fondo del rotulador fluorescente. Devuelve 0 (tinta) o 255.
 */
export function binarize(gray: Uint8Array, w: number, h: number, windowSize = Math.max(15, Math.round(w / 20)), t = 0.15): Uint8Array {
  const integral = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x]
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row
    }
  }
  const out = new Uint8Array(w * h)
  const half = windowSize >> 1
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(h - 1, y + half)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(w - 1, x + half)
      const count = (x1 - x0 + 1) * (y1 - y0 + 1)
      const sum = integral[(y1 + 1) * (w + 1) + x1 + 1] - integral[y0 * (w + 1) + x1 + 1]
        - integral[(y1 + 1) * (w + 1) + x0] + integral[y0 * (w + 1) + x0]
      out[y * w + x] = gray[y * w + x] * count < sum * (1 - t) ? 0 : 255
    }
  }
  return out
}

/**
 * Estima la inclinación del texto (grados) maximizando la varianza del perfil de proyección
 * horizontal de la tinta. `bin` es una imagen binaria pequeña (0 = tinta).
 */
export function estimateSkew(bin: Uint8Array, w: number, h: number, maxDeg = 10, step = 0.5): number {
  const ink: number[] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!bin[y * w + x]) ink.push(x, y)
  if (ink.length < 200) return 0
  const cx = w / 2, cy = h / 2
  let best = 0, bestVar = -1
  for (let deg = -maxDeg; deg <= maxDeg + 1e-9; deg += step) {
    const a = (deg * Math.PI) / 180
    const s = Math.sin(a), c = Math.cos(a)
    const rows = new Float64Array(h * 2)
    for (let i = 0; i < ink.length; i += 2) {
      const y = Math.round(-(ink[i] - cx) * s + (ink[i + 1] - cy) * c + h)
      if (y >= 0 && y < rows.length) rows[y]++
    }
    let sum = 0, sum2 = 0
    for (const v of rows) { sum += v; sum2 += v * v }
    const variance = sum2 / rows.length - (sum / rows.length) ** 2
    if (variance > bestVar) { bestVar = variance; best = deg }
  }
  return best
}

/** Elimina la "tinta" conectada al borde (mesa, sombras, otros tickets) de una imagen binaria. */
export function clearBorder(bin: Uint8Array, w: number, h: number): void {
  const stack: number[] = []
  const push = (p: number) => { if (bin[p] === 0) { bin[p] = 255; stack.push(p) } }
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1) }
  while (stack.length) {
    const p = stack.pop()!
    const x = p % w
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (p >= w) push(p - w)
    if (p < (h - 1) * w) push(p + w)
  }
}
