// Extracción de datos de tickets de compra españoles mediante reglas (sin IA).
// Entrada: texto plano obtenido por OCR o de la capa de texto de un PDF.

export interface Amount {
  value: number // en euros
  line: number // índice de línea
  text: string // línea original
}

export interface TicketData {
  merchant: string | null
  nif: string | null
  date: string | null // ISO yyyy-mm-dd
  time: string | null // HH:MM
  total: number | null
  totalConfidence: 'alta' | 'media' | 'baja' | null
  amounts: Amount[]
}

const MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
}

/** Quita tildes y pasa a mayúsculas para comparar palabras clave. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

/** Corrige confusiones típicas del OCR dentro de cifras: O→0, l/I→1, S→5, B→8. */
export function fixOcrDigits(line: string): string {
  return line.replace(/[0-9OoIlSB]+\s?[.,]\s?[0-9OoIlSB]{2}(?![0-9A-Za-z])/g, (tok) =>
    /\d/.test(tok)
      ? tok.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/\s/g, '')
      : tok,
  )
}

// ---------- Fechas ----------

function validDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000
  const maxYear = new Date().getFullYear() + 1
  if (y < 2000 || y > maxYear || m < 1 || m > 12 || d < 1) return null
  const dim = new Date(y, m, 0).getDate()
  if (d > dim) return null
  if (!Number.isFinite(m)) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const DATE_NUM = /(?<!\d)(\d{1,2})\s?[/\-.]\s?(\d{1,2})\s?[/\-.]\s?(\d{4}|\d{2})(?!\d)/g
const DATE_ISO = /(?<!\d)(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})(?!\d)/g
const DATE_TXT = /(?<!\d)(\d{1,2})\s*(?:DE\s+)?(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEPT?|SET|OCT|NOV|DIC)[A-Z]*\.?\s*(?:DE\s+|[/\-.]\s?)?(\d{4}|\d{2})(?!\d)/g

/** Devuelve las fechas válidas de una línea junto con el fragmento que ocupan. */
function datesInLine(line: string): { iso: string; match: string }[] {
  const out: { iso: string; match: string }[] = []
  const up = fold(line)
  for (const m of up.matchAll(DATE_ISO)) {
    const iso = validDate(+m[1], +m[2], +m[3])
    if (iso) out.push({ iso, match: m[0] })
  }
  for (const m of up.matchAll(DATE_NUM)) {
    const iso = validDate(+m[3], +m[2], +m[1])
    if (iso) out.push({ iso, match: m[0] })
  }
  for (const m of up.matchAll(DATE_TXT)) {
    const iso = validDate(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1])
    if (iso) out.push({ iso, match: m[0] })
  }
  return out
}

// ---------- Importes ----------

const AMOUNT = /(?<![\d.,])(-?\d{1,3}(?:[.\s]\d{3})+|-?\d+)\s?[,.]\s?(\d{2})(?![\d%])(?!\s?%)/g

function amountsInLine(line: string): number[] {
  // Elimina fechas y horas para no confundirlas con importes (12.03.2026, 13:45)
  let clean = line
  for (const d of datesInLine(line)) clean = clean.replace(new RegExp(d.match.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'i'), ' ')
  clean = clean.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ')
  const out: number[] = []
  for (const m of clean.matchAll(AMOUNT)) {
    const int = m[1].replace(/[.\s]/g, '')
    const value = parseFloat(`${int}.${m[2]}`)
    if (Number.isFinite(value) && Math.abs(value) < 1_000_000) out.push(value)
  }
  return out
}

// Palabras que indican que el importe NO es el total
const EXCLUDE = /SUBTOTAL|SUB-TOTAL|BASE|I\.?V\.?A|CUOTA|IMPUESTO|CAMBIO|DEVOL|ENTREGAD|DESCUENTO|DTO|AHORR|PUNTOS|SALDO|PROPINA|TOTAL\s+(ARTICULOS|ART|UDS|UNIDADES|PIEZAS|LINEAS)|REDONDEO|RECARGO|%/

const TOTAL_RULES: { re: RegExp; score: number }[] = [
  { re: /TOTAL\s*(A\s*PAGAR|COMPRA|TICKET|FACTURA|EUR|EUROS|€|\(EUR\)|\(€\))/, score: 10 },
  { re: /IMPORTE\s*TOTAL|TOTAL\s*IMPORTE/, score: 10 },
  { re: /\bTOTAL\b/, score: 8 },
  { re: /A\s*PAGAR|IMPORTE\s*(A\s*)?COBRAR/, score: 7 },
  { re: /TARJETA|VISA|MASTERCARD|MAESTRO|BIZUM|CONTACTLESS|PAGADO|COBRADO/, score: 5 },
  { re: /\bIMPORTE\b/, score: 4 },
  { re: /EFECTIVO/, score: 3 },
]

// ---------- Comercio y NIF ----------

const NIF = /(?<![A-Z0-9])(?:[ABCDEFGHJNPQRSUVW][\s-]?\d{7}[\s-]?[0-9A-J]|\d{8}[\s-]?[A-Z]|[XYZ][\s-]?\d{7}[\s-]?[A-Z])(?![A-Z0-9])/
const NOT_MERCHANT = /TICKET|FACTURA|SIMPLIFICADA|N\.?I\.?F|C\.?I\.?F|TEL[E.]|TFNO|WWW|HTTP|@|BIENVENID|GRACIAS|FECHA|HORA|CAJA|^(C\/|CALLE|AVDA|AVENIDA|PLAZA|PZA|PASEO|CTRA|POL)\b|TOTAL|\d[,.]\d{2}(?!\d)|^\W*$|^\d/

function findMerchant(lines: string[]): string | null {
  for (const raw of lines.slice(0, 6)) {
    const line = raw.trim()
    const letters = (line.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) ?? []).length
    if (letters < 3 || letters < line.length * 0.5) continue
    if (NOT_MERCHANT.test(fold(line))) continue
    return line.replace(/\s{2,}/g, ' ')
  }
  return null
}

// ---------- API principal ----------

export function parseTicket(text: string): TicketData {
  const lines = text
    .split(/\r?\n/)
    .map((l) => fixOcrDigits(l.replace(/[|]/g, ' ').trim()))
    .filter((l) => l.length > 0)

  // Fecha: se prefiere la de una línea con "FECHA"; si no, la primera válida
  let date: string | null = null
  let dateFromLabel = false
  for (const l of lines) {
    const ds = datesInLine(l)
    if (!ds.length) continue
    const labelled = /FECHA|F\.\s?EMISION|DATE/.test(fold(l))
    if (!date || (labelled && !dateFromLabel)) {
      date = ds[0].iso
      dateFromLabel = labelled
    }
  }

  const timeMatch = text.match(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?!\d)/)
  const time = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : null

  const nifMatch = fold(text).match(NIF)
  const nif = nifMatch ? nifMatch[0].replace(/[\s-]/g, '') : null

  // Importes
  const amounts: Amount[] = []
  lines.forEach((l, i) => amountsInLine(l).forEach((value) => amounts.push({ value, line: i, text: l })))

  // Total por palabras clave
  let best: { value: number; score: number } | null = null
  lines.forEach((l, i) => {
    const up = fold(l)
    const rule = TOTAL_RULES.find((r) => r.re.test(up))
    if (!rule || EXCLUDE.test(up.replace(rule.re, ''))) return
    if (/SUBTOTAL|SUB-TOTAL/.test(up)) return
    let vals = amountsInLine(l)
    // El importe puede estar en la línea siguiente
    if (!vals.length && i + 1 < lines.length && !TOTAL_RULES.some((r) => r.re.test(fold(lines[i + 1])))) {
      vals = amountsInLine(lines[i + 1])
    }
    let score = rule.score
    let positive = vals.filter((v) => v > 0)
    if (!positive.length) {
      // El OCR a veces pierde la coma: "TOTAL 517" → 5,17 (los tickets siempre llevan 2 decimales)
      const lost = up.match(/(?<![\d.,])(\d{3,6})\s*(?:€|EUR|EUROS)?\s*$/)
      if (!lost) return
      positive = [parseInt(lost[1], 10) / 100]
      score = Math.min(score, 7) - 0.5
    }
    const value = positive[positive.length - 1] // el importe suele ir al final de la línea
    if (!best || score > best.score || (score === best.score && value > best.value)) {
      best = { value, score }
    }
  })

  let total: number | null = null
  let totalConfidence: TicketData['totalConfidence'] = null
  const chosen = best as { value: number; score: number } | null
  if (chosen) {
    total = chosen.value
    totalConfidence = chosen.score >= 8 ? 'alta' : 'media'
  } else {
    // Sin palabra clave: el mayor importe que no esté en una línea excluida
    const candidates = amounts.filter((a) => a.value > 0 && !EXCLUDE.test(fold(a.text)))
    if (candidates.length) {
      total = Math.max(...candidates.map((a) => a.value))
      totalConfidence = 'baja'
    }
  }

  return { merchant: findMerchant(lines), nif, date, time, total, totalConfidence, amounts }
}

export const formatEuro = (v: number) =>
  v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
