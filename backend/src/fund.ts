// Funds for bills that aren't paid every month (e.g. car insurance every 6 months).
//
// Each month sets aside part of the next bill, so the full amount is ready when it's due, and the
// bill is then paid from the fund instead of that month's budget. Nothing here is stored: the
// balance is worked out from the set-asides so far and the payments made.
//
// Months are "YYYY-MM" strings and money is whole cents.

export type FundBill = {
  amountCents: number // the bill each time it's due
  frequencyMonths: number // e.g. 6 for every 6 months
  nextDueDate: string // YYYY-MM-DD; earlier and later due dates follow from the frequency
  startMonth: string // when saving started (the month the bill was added)
}

export type FundMonth = {
  // Put aside this month toward the next due date
  setAsideCents: number
  // In the fund at the end of the month
  balanceCents: number
  // The due date this month's set-aside is saving for
  nextDueDate: string
  // Months of saving left before that due date, counting this one
  monthsLeft: number
  // Paid toward the bill this month
  paidCents: number
  // How a payment this month changes the remainder: the fund is released to pay the bill, and
  // whatever doesn't match (a bill higher or lower than what was saved) comes out of or goes back
  // to the remainder. Positive = more for the remainder. 0 in months without a payment.
  remainderChangeCents: number
}

// "2026-11" → months since year 0, so months can be added and compared as numbers
const toIndex = (month: string) => {
  const [year, m] = month.split('-').map(Number)
  return year * 12 + (m - 1)
}
const fromIndex = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`

// Months from one month to another: monthsBetween('2027-01', '2027-03') = 2
export function monthsBetween(from: string, to: string): number {
  return toIndex(to) - toIndex(from)
}

// The first due date in a month after `month`: in a due month, saving is already for the next one
export function upcomingDueDate(bill: Pick<FundBill, 'frequencyMonths' | 'nextDueDate'>, month: string): string {
  const day = bill.nextDueDate.slice(8)
  const anchor = toIndex(bill.nextDueDate.slice(0, 7))
  const target = toIndex(month)
  // Step from the known due date by whole bill periods to the first one after this month
  const periods = Math.floor((target - anchor) / bill.frequencyMonths) + 1
  return `${fromIndex(anchor + periods * bill.frequencyMonths)}-${day}`
}

// The fund for one month. `paymentsByMonth` holds what was paid toward this bill in each month.
// Before saving starts, the fund is empty.
export function fundForMonth(bill: FundBill, paymentsByMonth: ReadonlyMap<string, number>, month: string): FundMonth {
  let balanceCents = 0
  let result: FundMonth | null = null

  // Walk forward from the first month of saving, one month at a time
  for (let index = toIndex(bill.startMonth); index <= toIndex(month); index++) {
    const current = fromIndex(index)
    const paidCents = paymentsByMonth.get(current) ?? 0

    // A payment releases what the fund was holding for this bill; any mismatch goes to the remainder
    let remainderChangeCents = 0
    if (paidCents !== 0) {
      remainderChangeCents = balanceCents - paidCents
      balanceCents = 0
    }

    // Then save toward the next due date: what's still needed, shared by the months left
    const nextDueDate = upcomingDueDate(bill, current)
    const monthsLeft = monthsBetween(current, nextDueDate.slice(0, 7))
    const stillNeeded = Math.max(0, bill.amountCents - balanceCents)
    const setAsideCents = Math.ceil(stillNeeded / monthsLeft)
    balanceCents += setAsideCents

    result = { setAsideCents, balanceCents, nextDueDate, monthsLeft, paidCents, remainderChangeCents }
  }

  const nextDueDate = upcomingDueDate(bill, month)
  return (
    result ?? {
      setAsideCents: 0,
      balanceCents: 0,
      nextDueDate,
      monthsLeft: monthsBetween(month, nextDueDate.slice(0, 7)),
      paidCents: 0,
      remainderChangeCents: 0,
    }
  )
}
