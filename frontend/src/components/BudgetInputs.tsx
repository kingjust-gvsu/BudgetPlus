import type { ReactNode } from 'react'
import type { BudgetType, CategoryKind } from '../api/types'
import { effectiveBudgetType, type BudgetFormValues } from '../budgetForm'
import { HelpTip } from './HelpTip'

const FREQUENCIES = [
  { months: 1, label: 'Monthly' },
  { months: 2, label: 'Every 2 months' },
  { months: 3, label: 'Every 3 months' },
  { months: 4, label: 'Every 4 months' },
  { months: 6, label: 'Every 6 months' },
  { months: 12, label: 'Yearly' },
]

type Props = {
  kind: CategoryKind
  values: BudgetFormValues
  onChange: (values: BudgetFormValues) => void
  // 'form': each input gets a visible label (the add form).
  // 'cell': compact inputs labelled for screen readers only (an editable table row).
  layout: 'form' | 'cell'
  // Makes ids and screen-reader labels unique, e.g. the category being edited
  labelSuffix: string
  // Another category is already the remainder, so this one can't be
  remainderTaken: boolean
}

// The inputs for a category's budget, which change with its kind and budget type:
// expenses pick fixed / % of income / remainder; bills get an estimate and how often they're due.
// The percent slider isn't here: each form shows it on its own row below these inputs.
export function BudgetInputs({ kind, values, onChange, layout, labelSuffix, remainderTaken }: Props) {
  const budgetType = effectiveBudgetType(kind, values)
  const set = (changes: Partial<BudgetFormValues>) => onChange({ ...values, ...changes })
  const inputClass = layout === 'cell' ? 'cell-input' : undefined

  // Wraps an input in a labelled field for the form layout; labels it for screen readers in a cell
  // `help` adds a "?" explanation beside the visible label (form layout only)
  const control = (
    id: string,
    text: string,
    render: (props: { id: string; 'aria-label'?: string }) => ReactNode,
    help?: ReactNode,
  ) => {
    const fullId = `${id}-${labelSuffix}`.replace(/\W+/g, '-')
    if (layout === 'cell') return render({ id: fullId, 'aria-label': `${text} for ${labelSuffix}` })
    const label = <label htmlFor={fullId}>{text}</label>
    return (
      <div className="field">
        {help ? (
          <div className="label-with-help">
            {label}
            {help}
          </div>
        ) : (
          label
        )}
        {render({ id: fullId })}
      </div>
    )
  }

  return (
    <div className={layout === 'cell' ? 'budget-inputs' : 'budget-inputs budget-inputs-form'}>
      {kind === 'EXPENSE' &&
        control('budget-type', 'Budget as', (props) => (
          <select
            {...props}
            className={inputClass}
            value={values.budgetType}
            onChange={(e) => set({ budgetType: e.target.value as BudgetType })}
          >
            <option value="FIXED">Fixed amount</option>
            <option value="PERCENT_OF_INCOME">% of income</option>
            <option value="REMAINDER" disabled={remainderTaken}>
              {remainderTaken ? 'Remainder (already used)' : 'Remainder'}
            </option>
          </select>
        ), (
          <HelpTip label="What are the budget types?">
            <ul className="help-tip-list">
              <li>
                <strong>Fixed amount:</strong> the same limit every month.
              </li>
              <li>
                <strong>% of income:</strong> a share of your monthly income, so it changes when your income does.
              </li>
              <li>
                <strong>Remainder:</strong> whatever is left after all your other budgets. Only one category can be
                the remainder.
              </li>
            </ul>
          </HelpTip>
        ))}
      {budgetType === 'FIXED' &&
        control('budget-amount', kind === 'BILL' ? 'Estimate ($)' : 'Amount ($)', (props) => (
          <input
            {...props}
            className={`${inputClass ?? ''} input-amount`}
            inputMode="decimal"
            placeholder="0.00"
            value={values.amount}
            onChange={(e) => set({ amount: e.target.value })}
          />
        ))}
      {budgetType === 'PERCENT_OF_INCOME' &&
        control('budget-percent', 'Percent of income', (props) => (
          <input
            {...props}
            className={`${inputClass ?? ''} input-percent`}
            inputMode="decimal"
            placeholder="%"
            value={values.percent}
            onChange={(e) => set({ percent: e.target.value })}
          />
        ))}
      {kind === 'BILL' &&
        control('frequency', 'How often', (props) => (
          <select
            {...props}
            className={inputClass}
            value={values.frequencyMonths}
            onChange={(e) => set({ frequencyMonths: Number(e.target.value) })}
          >
            {FREQUENCIES.map((frequency) => (
              <option key={frequency.months} value={frequency.months}>
                {frequency.label}
              </option>
            ))}
          </select>
        ))}
      {kind === 'BILL' &&
        values.frequencyMonths > 1 &&
        control('next-due', 'Next due', (props) => (
          <input
            {...props}
            type="date"
            className={inputClass}
            value={values.nextDueDate}
            onChange={(e) => set({ nextDueDate: e.target.value })}
          />
        ))}
    </div>
  )
}
