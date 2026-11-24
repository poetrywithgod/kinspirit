/**
 * Live MP3 recording: the call mix is encoded as it plays, in small pieces, so even a very long call
 * never needs more memory than the finished file (about 28 MB an hour).
 */
export type Mp3Stream = { stop: () => Blob }

const KBPS = 64
const RATES = [32000, 44100, 48000]

export const canEncodeMp3 = (ctx: AudioContext) => RATES.includes(ctx.sampleRate)

export async function startMp3(ctx: AudioContext, source: AudioNode): Promise<Mp3Stream> {
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const enc = new Mp3Encoder(1, ctx.sampleRate, KBPS)
  const out: Uint8Array[] = []
  const node = ctx.createScriptProcessor(4096, 1, 1)
  const silent = ctx.createGain()
  silent.gain.value = 0
  node.onaudioprocess = (e) => {
    const f = e.inputBuffer.getChannelData(0)
    const s = new Int16Array(f.length)
    for (let i = 0; i < f.length; i++) {
      const v = Math.max(-1, Math.min(1, f[i]))
      s[i] = v < 0 ? v * 0x8000 : v * 0x7fff
    }
    const c = enc.encodeBuffer(s)
    if (c.length) out.push(c)
  }
  source.connect(node)
  node.connect(silent).connect(ctx.destination) // the processor only runs when connected on; this stays silent
  return {
    stop() {
      try {
        source.disconnect(node)
      } catch {
        /* already disconnected */
      }
      node.disconnect()
      node.onaudioprocess = null
      const tail = enc.flush()
      if (tail.length) out.push(tail)
      return new Blob(out as BlobPart[], { type: 'audio/mpeg' })
    },
  }
}
