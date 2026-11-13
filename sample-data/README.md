# Sample data

CSV files for testing the import on the Transactions page (**Import from bank CSV**).

## Set up these categories first

Set income to **$4,000** on Budget setup, then add:

| Name | Kind | Budget |
| --- | --- | --- |
| Rent | Bill | Estimate $1,200, monthly |
| Electric | Bill | Estimate $120, monthly |
| Internet | Bill | Estimate $65, monthly |
| Phone | Bill | Estimate $45, monthly |
| Car insurance | Bill | Estimate $600, every 6 months, next due 2027-03-15 |
| Groceries | Expense | 12% of income |
| Gas | Expense | $160 |
| Eating out | Expense | $200 |
| Household | Expense | $120 |
| Entertainment | Expense | $100 |
| Savings | Expense | Remainder |

## Files

| File | What it tests |
| --- | --- |
| `budget-plus-3-months.csv` | Sep–Nov 2026 with a **Category** column matching the table above, including the car insurance payment, a refund, and some uncategorized coffee. Uncheck "Leave out money coming in" to import the refund. |
| `checking-account-style.csv` | A typical checking export: spending is negative, paychecks positive, no categories. Paychecks are left out by default. |
| `debit-credit-columns.csv` | Separate **Debit** and **Credit** columns. |
| `messy-rows.csv` | Odd but valid formats (short dates, `$` signs, `(18.00)`, quoted commas) and 5 bad rows the preview should report. |
| `5000-transactions.csv` | A year of 5,000 transactions, for checking the dashboard stays fast (NFR-4). |

Importing a file twice is safe: transactions you already have are skipped.
