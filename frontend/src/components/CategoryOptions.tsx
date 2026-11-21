import type { Account, Category } from '../api/types'
import { transferChoice } from '../transactionInput'

type Props = {
  categories: Category[]
  accounts: Account[]
  // The transaction's own account, which it can't transfer to
  accountId: string
}

// The choices in a transaction's Category picker: uncategorized, each category, and a transfer to
// each other account (paying off a credit card, saving into a fund).
export function CategoryOptions({ categories, accounts, accountId }: Props) {
  const others = accounts.filter((a) => a.id !== accountId)
  return (
    <>
      <option value="">Uncategorized</option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
      {others.length > 0 && (
        <optgroup label="Transfer to">
          {others.map((account) => (
            <option key={account.id} value={transferChoice(account.id)}>
              {account.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )
}
