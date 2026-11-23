import { ApiError } from './api'
import { dataSaver } from './dataSaver'

export type Recording = {
  stop: () => Promise<{ blob: Blob; seconds: number }>
  cancel: () => void
}

const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']

/** Starts the microphone. Voice is recorded at a low bit rate to save data. */
export async function startRecording(): Promise<Recording> {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new ApiError('mic', 'Voice notes are not supported on this browser.')
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  } catch (e) {
    const name = e instanceof DOMException ? e.name : ''
    throw new ApiError(
      'mic',
      name === 'NotFoundError' ? 'No microphone found on this device.' : 'Allow microphone access to record voice notes.',
    )
  }
  const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t))
  const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: dataSaver() ? 16000 : 24000 })
  const chunks: Blob[] = []
  const started = Date.now()
  rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
  rec.start(1000)
  const release = () => stream.getTracks().forEach((t) => t.stop())

  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          release()
          resolve({ blob: new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }), seconds: (Date.now() - started) / 1000 })
        }
        if (rec.state !== 'inactive') rec.stop()
        else rec.onstop?.(new Event('stop'))
      }),
    cancel: () => {
      rec.ondataavailable = null
      rec.onstop = null
      if (rec.state !== 'inactive') rec.stop()
      release()
    },
  }
}
