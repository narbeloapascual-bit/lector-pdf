import { useCallback, useEffect, useRef, useState } from 'react'
import { EventBus, PDFFindController, PDFLinkService, PDFViewer } from './lib/viewer'
import 'pdfjs-dist/web/pdf_viewer.css'
import { loadPdf, type PDFDocumentProxy } from './lib/pdf'
import { clearLastFile, getPosition, getPref, loadLastFile, saveLastFile, savePosition, setPref } from './lib/storage'
import { Thumbnails } from './components/Thumbnails'
import { Outline, type OutlineItem } from './components/Outline'
import {
  IconClose, IconDown, IconExpand, IconMenu, IconMoon, IconNext, IconOpen, IconPrev,
  IconSearch, IconShrink, IconSun, IconUp, IconZoomIn, IconZoomOut,
} from './components/Icons'

type SidebarTab = 'thumbs' | 'outline'
type Theme = 'light' | 'dark'

const ZOOM_PRESETS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'page-width', label: 'Ancho de página' },
  { value: 'page-fit', label: 'Página completa' },
  { value: '0.5', label: '50 %' },
  { value: '0.75', label: '75 %' },
  { value: '1', label: '100 %' },
  { value: '1.25', label: '125 %' },
  { value: '1.5', label: '150 %' },
  { value: '2', label: '200 %' },
  { value: '3', label: '300 %' },
]

const isMobile = () => window.matchMedia('(max-width: 768px)').matches
const fullscreenSupported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

interface FindStatus {
  current: number
  total: number
  state: number | null // 0 encontrado, 1 no encontrado, 2 vuelta al inicio, 3 buscando
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<{ eventBus: EventBus; viewer: PDFViewer; linkService: PDFLinkService } | null>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const fingerprintRef = useRef<string>('')
  const scaleValueRef = useRef<string>('auto')

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [fileName, setFileName] = useState('')
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [scaleValue, setScaleValue] = useState('auto')
  const [scalePercent, setScalePercent] = useState(100)
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile() && getPref('sidebar') !== 'closed')
  const [tab, setTab] = useState<SidebarTab>('thumbs')
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || 'light')
  const [fullscreen, setFullscreen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [find, setFind] = useState<FindStatus>({ current: 0, total: 0, state: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [restoring, setRestoring] = useState(true)

  // ---------- Inicialización del visor de PDF.js ----------
  useEffect(() => {
    const container = containerRef.current!
    const eventBus = new EventBus()
    const linkService = new PDFLinkService({ eventBus, externalLinkTarget: 2 /* _blank */ })
    const findController = new PDFFindController({ eventBus, linkService })
    const viewer = new PDFViewer({
      container,
      viewer: viewerRef.current!,
      eventBus,
      linkService,
      findController,
      textLayerMode: 1,
      annotationMode: 1,
    })
    linkService.setViewer(viewer)
    pdfRef.current = { eventBus, viewer, linkService }

    eventBus.on('pagesinit', () => {
      const pos = getPosition(fingerprintRef.current)
      viewer.currentScaleValue = pos?.scale ?? scaleValueRef.current
      if (pos && pos.page > 1 && pos.page <= viewer.pagesCount) {
        viewer.currentPageNumber = pos.page
      }
    })
    eventBus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
      setPage(pageNumber)
      setPageInput(String(pageNumber))
      if (fingerprintRef.current) savePosition(fingerprintRef.current, pageNumber, scaleValueRef.current)
    })
    eventBus.on('scalechanging', ({ scale, presetValue }: { scale: number; presetValue?: string }) => {
      const value = presetValue ?? String(scale)
      scaleValueRef.current = value
      setScaleValue(value)
      setScalePercent(Math.round(scale * 100))
      if (fingerprintRef.current) savePosition(fingerprintRef.current, viewer.currentPageNumber, value)
    })
    eventBus.on('updatefindmatchescount', ({ matchesCount }: { matchesCount: { current: number; total: number } }) => {
      setFind((f) => ({ ...f, ...matchesCount }))
    })
    eventBus.on('updatefindcontrolstate', ({ state, matchesCount }: { state: number; matchesCount: { current: number; total: number } }) => {
      setFind({ state, ...matchesCount })
    })

    // Redimensionar: re-aplica el zoom relativo (ancho, ajuste...) al cambiar el tamaño de la ventana
    const ro = new ResizeObserver(() => {
      const v = scaleValueRef.current
      if (docRef.current && ['auto', 'page-width', 'page-fit'].includes(v)) viewer.currentScaleValue = v
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      viewer.setDocument(null as unknown as PDFDocumentProxy)
      pdfRef.current = null
    }
  }, [])

  // ---------- Abrir documento ----------
  const openBlob = useCallback(async (blob: Blob, name: string, persist: boolean) => {
    const pdf = pdfRef.current
    if (!pdf) return
    setLoading(true)
    setError('')
    try {
      const data = await blob.arrayBuffer()
      const newDoc = await loadPdf(data)
      const old = docRef.current
      docRef.current = newDoc
      fingerprintRef.current = newDoc.fingerprints[0] ?? name
      pdf.viewer.setDocument(newDoc)
      pdf.linkService.setDocument(newDoc, null)
      await old?.loadingTask.destroy()
      setDoc(newDoc)
      setFileName(name)
      document.title = `${name} · Lector PDF`
      setQuery('')
      setFind({ current: 0, total: 0, state: null })
      const pos = getPosition(fingerprintRef.current)
      setPage(pos?.page ?? 1)
      setPageInput(String(pos?.page ?? 1))
      newDoc.getOutline().then((o) => setOutline((o as OutlineItem[] | null) ?? []))
      if (persist) saveLastFile({ name, data: blob })
    } catch (e) {
      const msg = e instanceof Error && e.name === 'PasswordException'
        ? 'El PDF está protegido con contraseña y no se puede abrir.'
        : 'No se pudo abrir el archivo. Comprueba que sea un PDF válido.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const openFile = useCallback((file: File | undefined | null) => {
    if (!file) return
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Solo se pueden abrir archivos PDF.')
      return
    }
    openBlob(file, file.name, true)
  }, [openBlob])

  // Reabrir el último PDF al recargar
  useEffect(() => {
    loadLastFile().then((f) => {
      if (f) openBlob(f.data, f.name, false).finally(() => setRestoring(false))
      else setRestoring(false)
    })
  }, [openBlob])

  const closeDocument = useCallback(async () => {
    const pdf = pdfRef.current
    pdf?.viewer.setDocument(null as unknown as PDFDocumentProxy)
    pdf?.linkService.setDocument(null, null)
    await docRef.current?.loadingTask.destroy()
    docRef.current = null
    fingerprintRef.current = ''
    setDoc(null)
    setOutline([])
    setFileName('')
    setSearchOpen(false)
    document.title = 'Lector PDF'
    clearLastFile()
  }, [])

  // ---------- Navegación y zoom ----------
  const goToPage = useCallback((n: number) => {
    const viewer = pdfRef.current?.viewer
    if (!viewer || !docRef.current) return
    const target = Math.min(Math.max(1, n), viewer.pagesCount)
    viewer.currentPageNumber = target
    setPageInput(String(target))
    if (isMobile()) setSidebarOpen(false)
  }, [])

  const setZoom = useCallback((value: string) => {
    const viewer = pdfRef.current?.viewer
    if (viewer && docRef.current) viewer.currentScaleValue = value
  }, [])

  const zoomIn = useCallback(() => pdfRef.current?.viewer.increaseScale(), [])
  const zoomOut = useCallback(() => pdfRef.current?.viewer.decreaseScale(), [])

  const navigateOutline = useCallback((item: OutlineItem) => {
    const pdf = pdfRef.current
    if (!pdf) return
    if (item.dest) {
      pdf.linkService.goToDestination(item.dest as Parameters<PDFLinkService['goToDestination']>[0])
    } else if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer')
    }
    if (isMobile()) setSidebarOpen(false)
  }, [])

  // ---------- Búsqueda ----------
  const dispatchFind = useCallback((type: '' | 'again', findPrevious = false, q = query) => {
    pdfRef.current?.eventBus.dispatch('find', {
      source: null,
      type,
      query: q,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious,
      matchDiacritics: false,
    })
  }, [query])

  const openSearch = useCallback(() => {
    if (!docRef.current) return
    setSearchOpen(true)
    requestAnimationFrame(() => searchInputRef.current?.select())
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    pdfRef.current?.eventBus.dispatch('findbarclose', { source: null })
  }, [])

  // ---------- Tema y pantalla completa ----------
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111827' : '#f3f4f6')
    setPref('theme', theme)
  }, [theme])

  useEffect(() => {
    setPref('sidebar', sidebarOpen ? 'open' : 'closed')
  }, [sidebarOpen])

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen().catch(() => {})
  }, [])

  // ---------- Atajos de teclado ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const typing = (e.target as HTMLElement)?.closest('input, select, textarea')
      if (mod && e.key.toLowerCase() === 'f') {
        if (docRef.current) {
          e.preventDefault()
          openSearch()
        }
        return
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        fileInputRef.current?.click()
        return
      }
      if (e.key === 'Escape' && searchOpen) {
        closeSearch()
        return
      }
      if (typing || !docRef.current) return
      const viewer = pdfRef.current!.viewer
      if (mod && (e.key === '+' || e.key === '=')) { e.preventDefault(); zoomIn() }
      else if (mod && e.key === '-') { e.preventDefault(); zoomOut() }
      else if (mod && e.key === '0') { e.preventDefault(); setZoom('auto') }
      else if (mod) return
      else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'n' || e.key === 'j') { e.preventDefault(); viewer.nextPage() }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'p' || e.key === 'k') { e.preventDefault(); viewer.previousPage() }
      else if (e.key === 'Home') { e.preventDefault(); goToPage(1) }
      else if (e.key === 'End') { e.preventDefault(); goToPage(viewer.pagesCount) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen, openSearch, closeSearch, zoomIn, zoomOut, setZoom, goToPage])

  // Ctrl + rueda: zoom en lugar del zoom del navegador
  useEffect(() => {
    const container = containerRef.current!
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !docRef.current) return
      e.preventDefault()
      pdfRef.current?.viewer.updateScale({
        drawingDelay: 400,
        scaleFactor: Math.exp(-e.deltaY / 300),
        origin: [e.clientX, e.clientY],
      })
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [])

  // Pellizcar para hacer zoom en móvil
  useEffect(() => {
    const container = containerRef.current!
    let startDist = 0
    let lastDist = 0
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2 && docRef.current) {
        startDist = lastDist = dist(e.touches)
      }
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !startDist) return
      e.preventDefault()
      const d = dist(e.touches)
      const factor = d / lastDist
      if (Math.abs(factor - 1) < 0.02) return
      lastDist = d
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2
      pdfRef.current?.viewer.updateScale({ drawingDelay: 300, scaleFactor: factor, origin: [cx, cy] })
    }
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0
    }
    container.addEventListener('touchstart', onStart, { passive: true })
    container.addEventListener('touchmove', onMove, { passive: false })
    container.addEventListener('touchend', onEnd)
    return () => {
      container.removeEventListener('touchstart', onStart)
      container.removeEventListener('touchmove', onMove)
      container.removeEventListener('touchend', onEnd)
    }
  }, [])

  // ---------- Arrastrar y soltar ----------
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
    const onEnter = (e: DragEvent) => { if (hasFiles(e)) { depth++; setDragging(true) } }
    const onLeave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDragging(false) } }
    const onOver = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault() }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      openFile(e.dataTransfer?.files[0])
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [openFile])

  const numPages = doc?.numPages ?? 0
  const zoomIsPreset = ZOOM_PRESETS.some((z) => z.value === scaleValue)
  const findLabel =
    find.state === 3 ? 'Buscando…'
    : !query ? ''
    : find.total > 0 ? `${find.current} de ${find.total}`
    : find.state === 1 ? 'Sin resultados'
    : ''

  return (
    <div className={`app ${doc ? 'has-doc' : ''} ${sidebarOpen && doc ? 'sidebar-open' : ''}`}>
      <header className="toolbar" role="toolbar" aria-label="Barra de herramientas">
        <div className="group">
          <button className="icon-btn" onClick={() => setSidebarOpen((v) => !v)} disabled={!doc}
            aria-label="Mostrar u ocultar panel lateral" aria-pressed={sidebarOpen} title="Panel lateral">
            <IconMenu />
          </button>
          <button className="icon-btn" onClick={() => fileInputRef.current?.click()} aria-label="Abrir PDF" title="Abrir PDF (Ctrl+O)">
            <IconOpen />
          </button>
          {fileName && <span className="filename" title={fileName}>{fileName}</span>}
        </div>

        {doc && (
          <div className="group center">
            <button className="icon-btn" onClick={() => pdfRef.current?.viewer.previousPage()} disabled={page <= 1}
              aria-label="Página anterior" title="Página anterior">
              <IconPrev />
            </button>
            <form className="page-form" onSubmit={(e) => { e.preventDefault(); goToPage(parseInt(pageInput, 10) || page) }}>
              <input
                className="page-input"
                inputMode="numeric"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
                onBlur={() => setPageInput(String(page))}
                onFocus={(e) => e.target.select()}
                aria-label="Número de página"
              />
              <span className="page-total">/ {numPages}</span>
            </form>
            <button className="icon-btn" onClick={() => pdfRef.current?.viewer.nextPage()} disabled={page >= numPages}
              aria-label="Página siguiente" title="Página siguiente">
              <IconNext />
            </button>
            <span className="sep hide-sm" />
            <button className="icon-btn hide-sm" onClick={zoomOut} aria-label="Reducir" title="Reducir (Ctrl −)"><IconZoomOut /></button>
            <select className="zoom-select" value={zoomIsPreset ? scaleValue : 'custom'} onChange={(e) => setZoom(e.target.value)}
              aria-label="Zoom">
              {!zoomIsPreset && <option value="custom">{scalePercent} %</option>}
              {ZOOM_PRESETS.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
            </select>
            <button className="icon-btn hide-sm" onClick={zoomIn} aria-label="Ampliar" title="Ampliar (Ctrl +)"><IconZoomIn /></button>
          </div>
        )}

        <div className="group end">
          {doc && (
            <button className="icon-btn" onClick={() => (searchOpen ? closeSearch() : openSearch())}
              aria-label="Buscar" aria-pressed={searchOpen} title="Buscar (Ctrl+F)">
              <IconSearch />
            </button>
          )}
          <button className="icon-btn" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          {fullscreenSupported && (
            <button className="icon-btn" onClick={toggleFullscreen}
              aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} title="Pantalla completa">
              {fullscreen ? <IconShrink /> : <IconExpand />}
            </button>
          )}
          {doc && (
            <button className="icon-btn" onClick={closeDocument} aria-label="Cerrar documento" title="Cerrar documento">
              <IconClose />
            </button>
          )}
        </div>
      </header>

      {searchOpen && (
        <div className="searchbar" role="search">
          <IconSearch className="search-icon" />
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Buscar en el documento"
            value={query}
            onChange={(e) => { setQuery(e.target.value); dispatchFind('', false, e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); dispatchFind('again', e.shiftKey) }
              if (e.key === 'Escape') closeSearch()
            }}
            aria-label="Texto a buscar"
            enterKeyHint="search"
          />
          <span className={`find-status ${find.state === 1 && query ? 'not-found' : ''}`} aria-live="polite">{findLabel}</span>
          <button className="icon-btn" onClick={() => dispatchFind('again', true)} disabled={!query} aria-label="Resultado anterior" title="Anterior (Mayús+Intro)"><IconUp /></button>
          <button className="icon-btn" onClick={() => dispatchFind('again', false)} disabled={!query} aria-label="Resultado siguiente" title="Siguiente (Intro)"><IconDown /></button>
          <button className="icon-btn" onClick={closeSearch} aria-label="Cerrar búsqueda"><IconClose /></button>
        </div>
      )}

      <div className="main">
        {doc && (
          <aside className="sidebar" aria-label="Panel lateral" hidden={!sidebarOpen}>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'thumbs'} className={tab === 'thumbs' ? 'active' : ''} onClick={() => setTab('thumbs')}>Miniaturas</button>
              <button role="tab" aria-selected={tab === 'outline'} className={tab === 'outline' ? 'active' : ''} onClick={() => setTab('outline')}>Índice</button>
            </div>
            <div className="sidebar-content">
              {tab === 'thumbs'
                ? <Thumbnails doc={doc} currentPage={page} onSelect={goToPage} />
                : <Outline items={outline} onNavigate={navigateOutline} />}
            </div>
          </aside>
        )}
        {doc && sidebarOpen && <div className="backdrop" onClick={() => setSidebarOpen(false)} />}

        <div className="viewer-wrap">
          <div ref={containerRef} className="viewer-container" tabIndex={-1}>
            <div ref={viewerRef} className="pdfViewer" />
          </div>

          {!doc && !restoring && (
            <div className="welcome">
              <div className="drop-card">
                <IconOpen width={48} height={48} />
                <h1>Lector PDF</h1>
                <p>Arrastra un PDF aquí o elige un archivo.</p>
                <button className="primary" onClick={() => fileInputRef.current?.click()}>Elegir PDF</button>
                <p className="hint">Tus archivos se abren en tu dispositivo y no se suben a ningún servidor.</p>
              </div>
            </div>
          )}
          {loading && <div className="loading" role="status">Abriendo PDF…</div>}
        </div>
      </div>

      {error && (
        <div className="toast" role="alert">
          {error}
          <button className="icon-btn" onClick={() => setError('')} aria-label="Cerrar aviso"><IconClose /></button>
        </div>
      )}
      {dragging && <div className="drop-overlay">Suelta el PDF para abrirlo</div>}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = '' }}
      />
    </div>
  )
}
