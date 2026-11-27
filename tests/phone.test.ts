import { describe, expect, it } from 'vitest'
import { COUNTRIES, contactNumber, countryOfNumber, normalizePhone, numbersFromVcf } from '../src/phone'

const country = (iso: string) => COUNTRIES.find((c) => c.iso === iso)!

describe('normalizePhone', () => {
  const ng = country('NG')
  it('accepts the local, plain and international Nigerian forms', () => {
    expect(normalizePhone(ng, '0803 123 4567')).toBe('+2348031234567')
    expect(normalizePhone(ng, '8031234567')).toBe('+2348031234567')
    expect(normalizePhone(ng, '+234 803 123 4567')).toBe('+2348031234567')
    expect(normalizePhone(ng, '2348031234567')).toBe('+2348031234567')
  })
  it('rejects numbers that cannot be Nigerian mobiles', () => {
    expect(normalizePhone(ng, '12345')).toBeNull()
    expect(normalizePhone(ng, '0203 123 4567')).toBeNull()
    expect(normalizePhone(ng, '')).toBeNull()
  })
  it('accepts a number typed with another country code', () => {
    expect(normalizePhone(ng, '+44 7700 900123')).toBe('+447700900123')
    expect(normalizePhone(ng, '0044 7700 900123')).toBe('+447700900123')
  })
  it('never makes a number longer than 15 digits', () => {
    expect(normalizePhone(country('GB'), '1'.repeat(14))).toBeNull()
  })
})

describe('countryOfNumber', () => {
  it('finds the country from the dialling code', () => {
    expect(countryOfNumber('+2348031234567').iso).toBe('NG')
    expect(countryOfNumber('+447700900123').iso).toBe('GB')
  })
})

describe('contactNumber', () => {
  const ng = country('NG')
  it('uses my country for local numbers', () => {
    expect(contactNumber('0803 123 4567', ng)).toBe('+2348031234567')
  })
  it('keeps international numbers as they are', () => {
    expect(contactNumber('+44 7700 900123', ng)).toBe('+447700900123')
    expect(contactNumber('0044 7700 900123', ng)).toBe('+447700900123')
  })
  it('skips junk', () => {
    expect(contactNumber('', ng)).toBeNull()
    expect(contactNumber('abc', ng)).toBeNull()
    expect(contactNumber('123', ng)).toBeNull()
  })
})

describe('numbersFromVcf', () => {
  it('reads the TEL lines of a contacts file', () => {
    const vcf = ['BEGIN:VCARD', 'FN:Ada', 'TEL;TYPE=CELL:0803 123 4567', 'item1.TEL:+44 7700 900123', 'EMAIL:a@b.c', 'END:VCARD'].join('\r\n')
    expect(numbersFromVcf(vcf)).toEqual(['0803 123 4567', '+44 7700 900123'])
  })
})
