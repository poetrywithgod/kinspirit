// Opens a picture on any phone. Older iPhones reject the "from-image" option of createImageBitmap,
// so we try the modern way, then the plain way, then an <img> element (which also fixes rotation).
export type Loaded = { source: CanvasImageSource; width: number; height: number; close: () => void }

export async function loadImage(file: Blob): Promise<Loaded> {
  for (const opts of [{ imageOrientation: 'from-image' as const }, undefined]) {
    try {
      const bmp = opts ? await createImageBitmap(file, opts) : await createImageBitmap(file)
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {
      /* try the next way */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}
