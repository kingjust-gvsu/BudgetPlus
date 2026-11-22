import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { monthOf, today } from './dates'

// The month the home view is showing. It lives in the address (?month=2026-10) so it carries
// across the Dashboard, Transactions, and Bills tabs; this month leaves it out.
export function useMonth(): [string, (month: string) => void] {
  const [params, setParams] = useSearchParams()
  const param = params.get('month')
  const month = param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : monthOf(today())
  const setMonth = useCallback(
    (next: string) =>
      setParams(
        (current) => {
          const updated = new URLSearchParams(current)
          if (next === monthOf(today())) updated.delete('month')
          else updated.set('month', next)
          return updated
        },
        { replace: true },
      ),
    [setParams],
  )
  return [month, setMonth]
}
