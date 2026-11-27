import { useRef, useState, type PointerEvent } from 'react'
import type { Rect } from '../lib/imageproc'

interface Props {
  src: string
  zones: Rect[] // en píxeles de la imagen original
  disabled?: boolean
  onPick: (zone: Rect) => void
}

/** Imagen sobre la que se dibujan rectángulos con el ratón o el dedo. */
export function RegionPicker({ src, zones, disabled, onPick }: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  const toImage = (e: PointerEvent) => {
    const img = imgRef.current!
    const b = img.getBoundingClientRect()
    return {
      x: Math.min(Math.max(e.clientX - b.left, 0), b.width),
      y: Math.min(Math.max(e.clientY - b.top, 0), b.height),
      kx: img.naturalWidth / b.width,
      ky: img.naturalHeight / b.height,
    }
  }

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toImage(e)
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const p = toImage(e)
    setDrag({ ...drag, x1: p.x, y1: p.y })
  }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const p = toImage(e)
    const x = Math.min(drag.x0, p.x), y = Math.min(drag.y0, p.y)
    const w = Math.abs(p.x - drag.x0), h = Math.abs(p.y - drag.y0)
    setDrag(null)
    if (w < 30 || h < 30) return
    onPick({ x: x * p.kx, y: y * p.ky, w: w * p.kx, h: h * p.ky })
  }

  const img = imgRef.current
  const k = img && img.naturalWidth ? img.getBoundingClientRect().width / img.naturalWidth : 0

  return (
    <div className={`region-picker ${disabled ? 'disabled' : ''}`} onPointerDown={onDown} onPointerMove={onMove}
      onPointerUp={onUp} onPointerCancel={() => setDrag(null)} data-testid="region-picker">
      <img ref={imgRef} src={src} alt="Foto de los tickets" draggable={false} />
      {k > 0 && zones.map((z, i) => (
        <div key={i} className="zone done" style={{ left: z.x * k, top: z.y * k, width: z.w * k, height: z.h * k }}>
          <span>{i + 1}</span>
        </div>
      ))}
      {drag && (
        <div className="zone" style={{
          left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1),
          width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0),
        }} />
      )}
    </div>
  )
}
