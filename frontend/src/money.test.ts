import { describe, expect, it } from 'vitest'
import { centsToInput, formatCents, parseDollars } from './money'

describe('parseDollars', () => {
  it.each([
    ['12', 1200],
    ['12.3', 1230],
    ['12.34', 1234],
    ['$1,234.56', 123456],
    [' 0.05 ', 5],
    ['-18', -1800],
  ])('reads %s as %i cents', (text, cents) => {
    expect(parseDollars(text)).toBe(cents)
  })

  it.each(['', 'abc', '12.345', '1.2.3', '$'])('rejects %j', (text) => {
    expect(parseDollars(text)).toBeNull()
  })
})

describe('formatCents', () => {
  it('formats cents as dollars', () => {
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(-1800)).toBe('-$18.00')
  })
})

describe('centsToInput', () => {
  it('turns cents back into a form value', () => {
    expect(centsToInput(3275)).toBe('32.75')
    expect(centsToInput(-1800)).toBe('-18.00')
  })
})
