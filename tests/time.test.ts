import { describe, expect, it } from 'vitest'
import { fmtDur, fmtSize } from '../src/time'

describe('fmtDur', () => {
  it('shows minutes and seconds, and hours when needed', () => {
    expect(fmtDur(0)).toBe('0:00')
    expect(fmtDur(14)).toBe('0:14')
    expect(fmtDur(125)).toBe('2:05')
    expect(fmtDur(3725)).toBe('1:02:05')
  })
  it('copes with bad numbers', () => {
    expect(fmtDur(NaN)).toBe('0:00')
    expect(fmtDur(-5)).toBe('0:00')
  })
})

describe('fmtSize', () => {
  it('uses KB below a megabyte and MB above', () => {
    expect(fmtSize(10)).toBe('1 KB')
    expect(fmtSize(2048)).toBe('2 KB')
    expect(fmtSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
