import type { Account, Category, IncomeSourceName } from '../api/types'
import { incomeChoice, OTHER_INCOME, transferChoice } from '../transactionInput'

type Props = {
  categories: Category[]
  accounts: Account[]
  incomeSources: IncomeSourceName[]
  // The transaction's own account, which it can't transfer to
  accountId: string
  // The account a transfer already goes to, offered even if it's closed
  currentTransferId?: string | null
}

// The choices in a transaction's Category picker: uncategorized, each category, a transfer to
// each other account (paying off a credit card, moving money into a bucket), and income (a paycheck).
export function CategoryOptions({ categories, accounts, incomeSources, accountId, currentTransferId }: Props) {
  // Closed accounts aren't offered, unless this transfer already goes to one
  const others = accounts.filter((a) => a.id !== accountId && (!a.closed || a.id === currentTransferId))
  return (
    <>
      <option value="">Uncategorized</option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
      <optgroup label="Income">
        {incomeSources.map((source) => (
          <option key={source.id} value={incomeChoice(source.id)}>
            {source.name}
          </option>
        ))}
        <option value={incomeChoice(OTHER_INCOME)}>Other income</option>
      </optgroup>
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
