import { useEffect, useState } from 'react'
import { CloseIcon, DownloadIcon } from './icons'

/** A picture shown full screen. Tap it to zoom in and out. Used for chat photos and profile photos. */
export function Lightbox({
  src,
  name,
  onClose,
  onSave,
}: {
  src: string
  name: string
  onClose: () => void
  onSave?: () => void
}) {
  const [zoom, setZoom] = useState(false)
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="lightbox" role="dialog" aria-label={name}>
      <header className="lightbox-top">
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
        <span className="lightbox-name">{name}</span>
        {onSave && (
          <button type="button" className="icon-btn" aria-label="Save to your phone" onClick={onSave}>
            <DownloadIcon />
          </button>
        )}
      </header>
      <div className={`lightbox-stage${zoom ? ' zoomed' : ''}`} onClick={() => setZoom((z) => !z)}>
        <img src={src} alt={name} />
      </div>
    </div>
  )
}
