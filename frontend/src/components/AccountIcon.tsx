import type { AccountType } from '../api/types'
import './AccountIcon.css'

// The outline drawn for each kind of account, in a 20 × 20 box
const PATHS: Record<AccountType, string> = {
  // A bank building: roof, four columns, and a base
  BANK: 'M3 8l7-4 7 4M4 8h12M5.5 8v6M8.5 8v6M11.5 8v6M14.5 8v6M3 16h14',
  // A card with a stripe and a short line of numbers
  CREDIT_CARD: 'M4 5h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM2 9h16M5 13h3',
  // A savings jar with a lid and a coin inside
  FUND: 'M6 4h8v2.5H6zM6.5 6.5h7l1.5 2.5v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9zM10 10.2a1.8 1.8 0 1 0 0 3.6a1.8 1.8 0 1 0 0-3.6z',
}

// A small icon for an account's type, in a soft rounded square. Decorative: the type or name
// beside it carries the meaning.
export function AccountIcon({ type }: { type: AccountType }) {
  return (
    <span className="account-icon" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 20 20">
        <path d={PATHS[type]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
