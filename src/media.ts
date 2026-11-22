// Helpers for photos, videos and files: what kind something is, shrinking big photos, and file names and types.
export type MediaKind = 'image' | 'video' | 'file'

const ext = (name: string) => name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() ?? ''

export const isImage = (f: { type?: string; name: string }) =>
  (f.type ?? '').startsWith('image/') || /^(jpe?g|png|gif|webp|bmp|avif|heic|heif)$/.test(ext(f.name))
export const isVideo = (f: { type?: string; name: string }) =>
  (f.type ?? '').startsWith('video/') || /^(mp4|mov|m4v|webm|mkv|avi|3gp|3gpp)$/.test(ext(f.name))

export const kindOf = (f: { type?: string; name: string }): MediaKind => (isImage(f) ? 'image' : isVideo(f) ? 'video' : 'file')

/** The short label shown on a file card, like PDF or DOCX. */
export const extLabel = (name: string) => (ext(name) || 'file').slice(0, 5).toUpperCase()

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
}

/** The file's own type, or a good guess from its name when the phone did not say. */
export const typeOf = (f: { type?: string; name: string }) => f.type || TYPES[ext(f.name)] || 'application/octet-stream'

export type Prepared = { blob: Blob; name: string; type: string; width?: number; height?: number; duration?: number }

const loadBitmap = async (f: Blob) => {
  try {
    return await createImageBitmap(f, { imageOrientation: 'from-image' })
  } catch {
    return null
  }
}

/** A photo: big JPEGs are shrunk to save data (the name and the JPEG format stay). Everything else goes as it is. */
export async function prepareImage(file: File): Promise<Prepared> {
  const type = typeOf(file)
  const bmp = await loadBitmap(file)
  const base: Prepared = { blob: file, name: file.name, type, width: bmp?.width, height: bmp?.height }
  if (!bmp || type !== 'image/jpeg' || file.size < 1_200_000) {
    bmp?.close()
    return base
  }
  const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')?.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82))
  if (!out || out.size >= file.size) return base
  return { blob: out, name: file.name, type: 'image/jpeg', width: w, height: h }
}

/** A video: its size on screen and length, read from the file itself. */
export function probeVideo(file: Blob): Promise<{ width?: number; height?: number; duration?: number }> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    const url = URL.createObjectURL(file)
    const done = (r: { width?: number; height?: number; duration?: number }) => {
      URL.revokeObjectURL(url)
      resolve(r)
    }
    const t = window.setTimeout(() => done({}), 4000)
    v.preload = 'metadata'
    v.muted = true
    v.onloadedmetadata = () => {
      window.clearTimeout(t)
      done({ width: v.videoWidth || undefined, height: v.videoHeight || undefined, duration: Number.isFinite(v.duration) ? v.duration : undefined })
    }
    v.onerror = () => {
      window.clearTimeout(t)
      done({})
    }
    v.src = url
  })
}
