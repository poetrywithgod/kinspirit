// Voice-note waveforms. The sender's phone measures the loudness while recording and sends it inside the
// message text ("Voice note|wf:" plus 40 characters), so everyone sees the same picture before playing.
const N = 40
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
const PREFIX = '|wf:'

/** Squeezes loudness readings (0..1) into 40 bars, then into a short text. */
export function encodeWave(levels: number[]): string {
  if (levels.length === 0) return ''
  const bars: number[] = []
  for (let i = 0; i < N; i++) {
    const from = Math.floor((i * levels.length) / N)
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / N))
    let peak = 0
    for (let j = from; j < to && j < levels.length; j++) peak = Math.max(peak, levels[j])
    bars.push(peak)
  }
  const top = Math.max(0.05, ...bars)
  return PREFIX + bars.map((b) => DIGITS[Math.min(35, Math.round((b / top) * 35))]).join('')
}

/** Bars (0..1) from a message's text, or a calm made-up pattern for older voice notes. */
export function waveOf(body: string | undefined, id: string): number[] {
  const at = body?.indexOf(PREFIX) ?? -1
  if (body && at >= 0) {
    const s = body.slice(at + PREFIX.length)
    if (s.length === N) return [...s].map((c) => Math.max(0.08, DIGITS.indexOf(c) / 35)).map((v) => (v < 0 ? 0.1 : v))
  }
  let h = 2166136261
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return Array.from({ length: N }, (_, i) => {
    h = Math.imul(h ^ (i + 1), 16777619)
    return 0.2 + (((h >>> 0) % 1000) / 1000) * 0.6
  })
}
