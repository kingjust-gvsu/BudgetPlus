// Helpers for the spending charts

import type { CategorySpending } from './api/types'
import { formatShortMonth } from './dates'

// Round gridlines for a chart whose biggest value is `cents`: a step like $250, $500, or $1,000,
// and a top that's the first step at or above the biggest value (about 3 to 5 gridlines).
export function niceScale(cents: number): { top: number; step: number } {
  if (cents <= 0) return { top: 10000, step: 2500 }
  const rough = cents / 4
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((s) => s * power).find((s) => s >= rough)!
  return { top: Math.ceil(cents / step) * step, step }
}

// The biggest categories get their own slice and the rest share "Other". These five colors
// (in this order) and the gray stay tellable apart next to each other, including for color blindness.
const SLICE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']
const OTHER_COLOR = '#c9cbce'

type Slice = { key: string; name: string; cents: number; color: string }

export function donutSlices(categories: CategorySpending[]): Slice[] {
  const spent = categories.filter((c) => c.spentCents > 0)
  const top = spent.slice(0, SLICE_COLORS.length)
  const rest = spent.slice(SLICE_COLORS.length)
  const slices = top.map((c, i) => ({ key: c.id ?? 'uncategorized', name: c.name, cents: c.spentCents, color: SLICE_COLORS[i] }))
  // One leftover category keeps its own name rather than being called "Other"
  if (rest.length === 1) slices.push({ key: rest[0].id ?? 'uncategorized', name: rest[0].name, cents: rest[0].spentCents, color: OTHER_COLOR })
  if (rest.length > 1) {
    const cents = rest.reduce((sum, c) => sum + c.spentCents, 0)
    slices.push({ key: 'other', name: `Other (${rest.length})`, cents, color: OTHER_COLOR })
  }
  return slices
}

// Labels under a run of months (null = no label), so they don't crowd:
// - up to 12 months: every month ("Oct")
// - up to 18: every other month, counting back from the latest
// - longer: just the year, at each January ("2024")
// When the months span more than one year, the first label and each January show the year ("Jan '26").
export function monthAxisLabels(months: string[]): (string | null)[] {
  if (months.length > 18) return months.map((m) => (m.endsWith('-01') ? m.slice(0, 4) : null))
  const every = Math.ceil(months.length / 12)
  const spansYears = months.length > 0 && months[0].slice(0, 4) !== months.at(-1)!.slice(0, 4)
  let first = true
  return months.map((m, i) => {
    if ((months.length - 1 - i) % every !== 0) return null // always label the latest month
    const label = formatShortMonth(m, spansYears && (first || m.endsWith('-01')))
    first = false
    return label
  })
}
