import { useCallback, useEffect, useRef, useState } from 'react'

const OUT = 512 // saved photo is 512 x 512 px: small to upload, sharp on screen
const MAX_WORK = 1600
const MAX_ZOOM = 4

async function loadWork(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const k = Math.min(1, MAX_WORK / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return c
}

function rotate90(c: HTMLCanvasElement): HTMLCanvasElement {
  const r = document.createElement('canvas')
  r.width = c.height
  r.height = c.width
  const x = r.getContext('2d')!
  x.translate(r.width, 0)
  x.rotate(Math.PI / 2)
  x.drawImage(c, 0, 0)
  return r
}

type View = { zoom: number; x: number; y: number }

const scaleFor = (w: number, h: number, V: number, zoom: number) => (V / Math.min(w, h)) * zoom

function clampView(v: View, w: number, h: number, V: number): View {
  const s = scaleFor(w, h, V, v.zoom)
  return {
    zoom: v.zoom,
    x: Math.min(0, Math.max(V - w * s, v.x)),
    y: Math.min(0, Math.max(V - h * s, v.y)),
  }
}

function centered(w: number, h: number, V: number): View {
  const s = scaleFor(w, h, V, 1)
  return { zoom: 1, x: (V - w * s) / 2, y: (V - h * s) / 2 }
}

// Zoom while keeping the middle of the frame where it is.
function zoomTo(v: View, zoom: number, w: number, h: number, V: number): View {
  const z = Math.min(MAX_ZOOM, Math.max(1, zoom))
  const s0 = scaleFor(w, h, V, v.zoom)
  const cx = (V / 2 - v.x) / s0
  const cy = (V / 2 - v.y) / s0
  const s1 = scaleFor(w, h, V, z)
  return clampView({ zoom: z, x: V / 2 - cx * s1, y: V / 2 - cy * s1 }, w, h, V)
}

export function PhotoCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File
  onCancel: (message?: string) => void
  onDone: (dataUrl: string) => void
}) {
  const [work, setWork] = useState<HTMLCanvasElement | null>(null)
  const [url, setUrl] = useState('')
  const [V, setV] = useState(300)
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 })
  const frame = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const lastDist = useRef(0)

  // Load the picture.
  useEffect(() => {
    let dead = false
    loadWork(file)
      .then((c) => !dead && setWork(c))
      .catch(() => !dead && onCancel('We could not read that picture. Try a JPG or PNG.'))
    return () => {
      dead = true
    }
  }, [file, onCancel])

  // Show the working picture.
  useEffect(() => {
    if (!work) return
    let objectUrl = ''
    let dead = false
    work.toBlob(
      (b) => {
        if (!b || dead) return
        objectUrl = URL.createObjectURL(b)
        setUrl(objectUrl)
      },
      'image/jpeg',
      0.92,
    )
    return () => {
      dead = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [work])

  // Measure the frame.
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const ro = new ResizeObserver(() => setV(el.clientWidth))
    ro.observe(el)
    setV(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Start centred whenever the picture or frame size changes.
  useEffect(() => {
    if (work) setView(centered(work.width, work.height, V))
  }, [work, V])

  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const W = work?.width ?? 1
  const H = work?.height ?? 1

  const changeZoom = useCallback(
    (factorOrValue: number, absolute = false) =>
      setView((v) => zoomTo(v, absolute ? factorOrValue : v.zoom * factorOrValue, W, H, V)),
    [W, H, V],
  )

  // Mouse wheel zoom (needs a non-passive listener to stop the page scrolling).
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      changeZoom(Math.exp(-e.deltaY * 0.002))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [changeZoom])

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      lastDist.current = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const now = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, now)
    if (pointers.current.size === 1) {
      const dx = now.x - prev.x
      const dy = now.y - prev.y
      setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }, W, H, V))
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (lastDist.current > 0) changeZoom(d / lastDist.current)
      lastDist.current = d
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    lastDist.current = 0
  }

  const s = scaleFor(W, H, V, view.zoom)

  const finish = () => {
    if (!work) return
    const out = document.createElement('canvas')
    out.width = OUT
    out.height = OUT
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, OUT, OUT)
    ctx.drawImage(work, -view.x / s, -view.y / s, V / s, V / s, 0, 0, OUT, OUT)
    onDone(out.toDataURL('image/jpeg', 0.85))
  }

  return (
    <div className="crop-backdrop" role="dialog" aria-modal="true" aria-label="Adjust your photo">
      <div className="crop-card">
        <h2 className="crop-title">Adjust your photo</h2>
        <div
          ref={frame}
          className="crop-frame"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {url && (
            <img
              src={url}
              alt=""
              draggable={false}
              style={{ width: W * s, height: H * s, transform: `translate(${view.x}px, ${view.y}px)` }}
            />
          )}
          {!url && <p className="crop-loading">Loading…</p>}
          <div className="crop-ring" aria-hidden="true" />
        </div>
        <p className="crop-help">Drag to move. Pinch or use the slider to zoom.</p>
        <div className="crop-zoom">
          <span aria-hidden="true">−</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={view.zoom}
            aria-label="Zoom"
            onChange={(e) => changeZoom(Number(e.target.value), true)}
          />
          <span aria-hidden="true">+</span>
        </div>
        <div className="crop-actions">
          <button
            type="button"
            className="crop-icon"
            aria-label="Rotate photo"
            disabled={!work}
            onClick={() => work && setWork(rotate90(work))}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 4v5h-5" />
            </svg>
          </button>
          <button type="button" className="btn btn-quiet crop-btn" onClick={() => onCancel()}>
            Cancel
          </button>
          <button type="button" className="btn crop-btn" disabled={!work || !url} onClick={finish}>
            Use photo
          </button>
        </div>
      </div>
    </div>
  )
}
