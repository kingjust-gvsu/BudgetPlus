// Dates are "YYYY-MM-DD" strings and months are "YYYY-MM", matching the API.

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const SHORT_MONTH_NAMES = MONTH_NAMES.map((name) => name.slice(0, 3))

const pad = (n: number) => String(n).padStart(2, '0')

// Today in the user's own time zone
export function today(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

// shiftMonth("2026-12", 1) → "2027-01"
export function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split('-').map(Number)
  const index = year * 12 + (m - 1) + by
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

// "2026-10" → "October 2026"
export function formatMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${year}`
}

// "2026-10-05" → "Oct 5"
export function formatDay(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${SHORT_MONTH_NAMES[m - 1]} ${d}`
}
