import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { parseTicket, formatDate, formatEuro, type Amount } from '../lib/ticket'
import { readImage, readPdf, type OcrResult } from '../lib/ocr'
import type { Rect } from '../lib/imageproc'
import { RegionPicker } from './RegionPicker'
import { deleteTicket, listTickets, putTicket, type SavedTicket } from '../lib/storage'
import { IconCamera, IconDownload, IconOpen, IconTrash } from './Icons'

export interface TicketsHandle {
  openFile: (file: File) => void
}

interface Draft {
  key: string
  fileName: string
  ocr: OcrResult
  merchant: string
  nif: string
  date: string
  time: string
  total: string // texto editable con coma decimal
  confidence: 'alta' | 'media' | 'suma' | 'baja' | null
  amounts: Amount[]
}

const toInput = (v: number | null) => (v == null ? '' : v.toFixed(2).replace('.', ','))
const fromInput = (s: string): number | null => {
  const n = parseFloat(s.replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const CONFIDENCE_LABEL = {
  alta: 'Total detectado junto a la palabra "TOTAL"',
  media: 'Total deducido del pago (tarjeta, importe…); revísalo',
  baja: 'No se encontró "TOTAL": se ha tomado el mayor importe; revísalo',
  suma: 'El total no se lee bien: calculado sumando los artículos; revísalo',
}

export const Tickets = forwardRef<TicketsHandle>(function Tickets(_props, ref) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<{ stage: string; value: number } | null>(null)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [saved, setSaved] = useState<SavedTicket[]>([])
  // Última foto leída: permite marcar a mano cada ticket cuando hay varios en la imagen
  const [photo, setPhoto] = useState<{ file: File; url: string; zones: Rect[] } | null>(null)

  useEffect(() => {
    listTickets().then(setSaved)
  }, [])

  const makeDraft = (ocr: OcrResult, fileName: string): Draft => {
    const data = parseTicket(ocr.text)
    return {
      key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fileName,
      ocr,
      merchant: data.merchant ?? '',
      nif: data.nif ?? '',
      date: data.date ?? '',
      time: data.time ?? '',
      total: toInput(data.total),
      confidence: data.totalConfidence,
      amounts: data.amounts,
    }
  }

  const process = useCallback(async (file: File) => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf && !file.type.startsWith('image/')) {
      setError('Formato no compatible. Usa una foto (JPG, PNG, WEBP) o un PDF.')
      return
    }
    setError('')
    setDrafts([])
    setBusy({ stage: 'Preparando', value: 0 })
    try {
      const progress = (stage: string, value: number) => setBusy({ stage, value })
      setPhoto((p) => {
        if (p) URL.revokeObjectURL(p.url)
        return isPdf ? null : { file, url: URL.createObjectURL(file), zones: [] }
      })
      const ocr = isPdf ? await readPdf(file, progress) : await readImage(file, progress)
      if (!ocr.text.trim()) setError('No se ha reconocido texto. Prueba con una foto más nítida, recta y con buena luz.')
      else setDrafts([makeDraft(ocr, file.name)])
    } catch (e) {
      console.warn(e)
      setError(file.type === 'image/heic' || /\.heic$/i.test(file.name)
        ? 'Este navegador no abre fotos HEIC. Cambia la cámara a "Más compatible" (JPG) o haz la foto desde la app.'
        : 'No se pudo leer el archivo.')
    } finally {
      setBusy(null)
    }
  }, [])

  useImperativeHandle(ref, () => ({ openFile: process }), [process])

  /** Lee solo la zona marcada de la foto (un ticket de varios). */
  const readZone = async (zone: Rect) => {
    if (!photo) return
    const n = photo.zones.length + 1
    setPhoto({ ...photo, zones: [...photo.zones, zone] })
    // Al marcar la primera zona, la lectura de la foto entera (mezcla de tickets) deja de servir
    if (n === 1) setDrafts([])
    setBusy({ stage: 'Preparando', value: 0 })
    setError('')
    try {
      const ocr = await readImage(photo.file, (stage, value) => setBusy({ stage: `Ticket ${n}: ${stage}`, value }), zone)
      setDrafts((ds) => [...ds, makeDraft(ocr, `${photo.file.name} (${n})`)])
    } catch (e) {
      console.warn(e)
      setError('No se pudo leer esa zona.')
    } finally {
      setBusy(null)
    }
  }

  const save = async (draft: Draft) => {
    const t: SavedTicket = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      fileName: draft.fileName,
      merchant: draft.merchant.trim(),
      nif: draft.nif.trim(),
      date: draft.date,
      time: draft.time,
      total: fromInput(draft.total),
      text: draft.ocr.text,
      thumb: draft.ocr.thumb,
    }
    await putTicket(t)
    setSaved(await listTickets())
    setDrafts((ds) => ds.filter((d) => d.key !== draft.key))
  }

  const remove = async (id: string) => {
    await deleteTicket(id)
    setSaved(await listTickets())
  }

  const exportCsv = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const rows = [
      ['Fecha', 'Hora', 'Comercio', 'NIF', 'Total (€)', 'Archivo'].join(';'),
      ...saved.map((t) => [
        t.date ? formatDate(t.date) : '',
        t.time,
        esc(t.merchant),
        t.nif,
        t.total == null ? '' : t.total.toFixed(2).replace('.', ','),
        esc(t.fileName),
      ].join(';')),
    ]
    // BOM para que Excel en español reconozca UTF-8; ";" y coma decimal
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const sum = saved.reduce((acc, t) => acc + (t.total ?? 0), 0)

  return (
    <div className="tickets">
      <section className="tickets-actions">
        <h1>Leer ticket</h1>
        <p className="muted">Reconocimiento de texto en tu dispositivo, sin IA ni servidores. Extrae comercio, fecha y total.</p>
        <div className="btn-row">
          <button className="primary" onClick={() => cameraRef.current?.click()} disabled={!!busy}>
            <IconCamera /> Hacer foto
          </button>
          <button className="secondary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            <IconOpen /> Imagen o PDF
          </button>
        </div>
        <p className="hint">Consejo: ticket plano, bien iluminado y ocupando toda la foto.</p>
      </section>

      {busy && (
        <div className="ocr-progress" role="status">
          <span>{busy.stage}…</span>
          <progress max={1} value={busy.value} />
        </div>
      )}
      {error && <p className="ticket-error" role="alert">{error}</p>}

      {photo && (
        <section className="zone-section" aria-label="Varios tickets en la foto">
          <details open={photo.zones.length > 0}>
            <summary>¿Hay varios tickets en la foto? Márcalos uno a uno</summary>
            <p className="muted small">Arrastra un rectángulo sobre cada ticket (de su nombre hasta el total). Cada zona se lee por separado.</p>
            <RegionPicker src={photo.url} zones={photo.zones} disabled={!!busy} onPick={readZone} />
          </details>
        </section>
      )}
      {drafts.map((draft) => {
        const update = (patch: Partial<Draft>) =>
          setDrafts((ds) => ds.map((d) => (d.key === draft.key ? { ...d, ...patch } : d)))
        return (
        <section key={draft.key} className="ticket-result" aria-label="Resultado">
          <img src={draft.ocr.preview} alt="Ticket procesado" className="ticket-preview" />
          <div className="ticket-fields">
            <label>
              Total (€)
              <input className="total-input" inputMode="decimal" value={draft.total}
                onChange={(e) => update({ total: e.target.value, confidence: null })} placeholder="0,00" />
            </label>
            {draft.confidence && (
              <p className={`confidence ${draft.confidence}`}>{CONFIDENCE_LABEL[draft.confidence]}</p>
            )}
            <label>
              Fecha
              <input type="date" value={draft.date} onChange={(e) => update({ date: e.target.value })} />
            </label>
            <label>
              Comercio
              <input value={draft.merchant} onChange={(e) => update({ merchant: e.target.value })} />
            </label>
            {draft.nif && <p className="muted small">NIF: {draft.nif}{draft.time && ` · Hora: ${draft.time}`}</p>}

            {draft.amounts.length > 0 && (
              <div className="amounts">
                <span className="muted small">Importes encontrados (toca uno para usarlo como total):</span>
                <div className="chips">
                  {[...new Set(draft.amounts.map((a) => a.value))].map((v) => (
                    <button key={v} className={`chip ${fromInput(draft.total) === v ? 'active' : ''}`}
                      onClick={() => update({ total: toInput(v), confidence: null })}>
                      {formatEuro(v)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <details>
              <summary>Texto reconocido {draft.ocr.source === 'pdf-text' && '(del propio PDF, sin OCR)'}</summary>
              <pre>{draft.ocr.text}</pre>
            </details>

            <div className="btn-row">
              <button className="primary" onClick={() => save(draft)}>Guardar ticket</button>
              <button className="secondary" onClick={() => setDrafts((ds) => ds.filter((d) => d.key !== draft.key))}>Descartar</button>
            </div>
          </div>
        </section>
              )
      })}

      <section className="ticket-list" aria-label="Tickets guardados">
        <div className="list-header">
          <h2>Tickets guardados <span className="muted">({saved.length})</span></h2>
          {saved.length > 0 && (
            <button className="secondary" onClick={exportCsv}><IconDownload /> Exportar CSV</button>
          )}
        </div>
        {saved.length === 0 ? (
          <p className="muted">Aún no has guardado ningún ticket. Se guardan solo en este navegador.</p>
        ) : (
          <>
            <ul>
              {saved.map((t) => (
                <li key={t.id}>
                  <img src={t.thumb} alt="" />
                  <div className="ticket-info">
                    <strong>{t.merchant || 'Sin comercio'}</strong>
                    <span className="muted small">{t.date ? formatDate(t.date) : 'Sin fecha'}</span>
                  </div>
                  <span className="ticket-total">{t.total == null ? '—' : formatEuro(t.total)}</span>
                  <button className="icon-btn" onClick={() => remove(t.id)} aria-label={`Borrar ticket de ${t.merchant || 'sin comercio'}`}>
                    <IconTrash />
                  </button>
                </li>
              ))}
            </ul>
            <p className="ticket-sum">Suma: <strong>{formatEuro(sum)}</strong></p>
          </>
        )}
      </section>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) process(f); e.target.value = '' }} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" hidden data-testid="ticket-file"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) process(f); e.target.value = '' }} />
    </div>
  )
})
