import { describe, expect, it } from 'vitest'
import type { CategorySpending } from './api/types'
import { donutSlices, monthAxisLabels } from './charts'

const category = (name: string, spentCents: number): CategorySpending => ({ id: name, name, kind: 'EXPENSE', spentCents, byMonthCents: [spentCents] })

describe('donutSlices', () => {
  it('gives the five biggest categories their own slice and puts the rest in Other', () => {
    const slices = donutSlices([
      category('Rent', 120000),
      category('Groceries', 40000),
      category('Gas', 15000),
      category('Eating out', 12000),
      category('Electric', 11000),
      category('Phone', 4500),
      category('Gifts', 2500),
    ])

    expect(slices.map((s) => [s.name, s.cents])).toEqual([
      ['Rent', 120000],
      ['Groceries', 40000],
      ['Gas', 15000],
      ['Eating out', 12000],
      ['Electric', 11000],
      ['Other (2)', 7000],
    ])
    expect(new Set(slices.map((s) => s.color)).size).toBe(6)
  })

  it('keeps the name of a single leftover category', () => {
    const slices = donutSlices(['A', 'B', 'C', 'D', 'E', 'F'].map((name, i) => category(name, 1000 - i)))

    expect(slices.at(-1)?.name).toBe('F')
  })
})

const monthRun = (first: string, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const index = Number(first.slice(0, 4)) * 12 + Number(first.slice(5, 7)) - 1 + i
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
  })

describe('monthAxisLabels', () => {
  it('labels every month in a short range, with years when it crosses one', () => {
    expect(monthAxisLabels(monthRun('2025-11', 4))).toEqual(["Nov '25", 'Dec', "Jan '26", 'Feb'])
  })

  it('labels every other month up to a year and a half', () => {
    expect(monthAxisLabels(monthRun('2025-06', 18)).filter(Boolean)).toEqual(["Jul '25", 'Sep', 'Nov', "Jan '26", 'Mar', 'May', 'Jul', 'Sep', 'Nov'])
  })

  it('labels just the years on long ranges', () => {
    expect(monthAxisLabels(monthRun('2021-12', 60)).filter(Boolean)).toEqual(['2022', '2023', '2024', '2025', '2026'])
  })
})
