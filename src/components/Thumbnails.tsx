import { memo, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from '../lib/pdf'

const THUMB_WIDTH = 120

interface Props {
  doc: PDFDocumentProxy
  currentPage: number
  onSelect: (page: number) => void
}

export function Thumbnails({ doc, currentPage, onSelect }: Props) {
  const listRef = useRef<HTMLOListElement>(null)
  const [ratio, setRatio] = useState(1.414)

  useEffect(() => {
    let cancelled = false
    doc.getPage(1).then((p) => {
      const vp = p.getViewport({ scale: 1 })
      if (!cancelled) setRatio(vp.height / vp.width)
    })
    return () => {
      cancelled = true
    }
  }, [doc])

  // Mantiene visible la miniatura de la página actual
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-page="${currentPage}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [currentPage])

  const pages = Array.from({ length: doc.numPages }, (_, i) => i + 1)
  return (
    <ol className="thumbs" ref={listRef}>
      {pages.map((n) => (
        <li key={n} data-page={n}>
          <button
            className={`thumb ${n === currentPage ? 'active' : ''}`}
            onClick={() => onSelect(n)}
            aria-label={`Ir a la página ${n}`}
            aria-current={n === currentPage ? 'page' : undefined}
          >
            <Thumb doc={doc} pageNumber={n} height={Math.round(THUMB_WIDTH * ratio)} />
            <span>{n}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

const Thumb = memo(function Thumb({ doc, pageNumber, height }: { doc: PDFDocumentProxy; pageNumber: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let task: { cancel: () => void } | null = null
    let done = false

    const io = new IntersectionObserver(
      async (entries) => {
        if (!entries.some((e) => e.isIntersecting) || done) return
        done = true
        io.disconnect()
        try {
          const page = await doc.getPage(pageNumber)
          const dpr = Math.min(window.devicePixelRatio || 1, 2)
          const vp = page.getViewport({ scale: (THUMB_WIDTH / page.getViewport({ scale: 1 }).width) * dpr })
          canvas.width = Math.floor(vp.width)
          canvas.height = Math.floor(vp.height)
          const render = page.render({ canvas, viewport: vp })
          task = render
          await render.promise
          page.cleanup()
        } catch {
          /* render cancelado al desmontar */
        }
      },
      { rootMargin: '300px 0px' },
    )
    io.observe(canvas)
    return () => {
      io.disconnect()
      task?.cancel()
    }
  }, [doc, pageNumber])

  return <canvas ref={canvasRef} style={{ width: THUMB_WIDTH, height }} />
})
