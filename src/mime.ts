// Phones can refuse to play a file whose type is missing or wrong, so the type is set from the file's extension.
const TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  wav: 'audio/wav',
  flac: 'audio/flac',
  amr: 'audio/amr',
  wma: 'audio/x-ms-wma',
  webm: 'audio/webm',
}

export function audioType(name: string, fallback = ''): string {
  const ext = name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ?? ''
  return TYPES[ext] ?? (fallback.startsWith('audio/') ? fallback : '')
}

export const withAudioType = (blob: Blob, name: string): Blob => {
  const t = audioType(name, blob.type)
  return t && t !== blob.type ? new Blob([blob], { type: t }) : blob
}
