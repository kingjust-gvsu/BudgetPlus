# Sample data

Files for testing imports: full backups for **Settings → Import a backup**, and CSV files for **Import from CSV** on the Transactions page.

## Full backups (quickest)

These replace all of your data, including income and categories, so there's nothing to set up first.

| File | What's in it |
| --- | --- |
| `full-budget-3-months.json` | The $4,000 budget below with Sep–Nov 2026 transactions. An older (version 1) backup: everything goes in one Checking account. |
| `full-budget-12-months.json` | The same budget plus Car registration and Gifts, with a year of transactions (Dec 2025 – Nov 2026). Also version 1. |
| `full-budget-5-years.json` | Five years (Dec 2021 – Nov 2026) that use everything: accounts (Checking, a Visa card, high-yield savings, a car insurance fund, and an old Discover card that's paid off and closed in 2023), everyday purchases on the cards with each month's statement paid off from Checking as a transfer, paychecks from two incomes (with raises and a second job from 2024) plus bonuses and tax refunds as other income, monthly saving into the funds, car insurance paid from its fund, and budgets that change over time (a gym that's cancelled in 2024, Travel added in 2022). Also seasonal electric bills, rent going up each year, December gift spikes, refunds, and big purchases like a couch, vacations, and car repairs. |

The two smaller files are older backup versions on purpose: they check that old backups still restore.

## CSV files

### Set up these categories first

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

### Files

| File | What it tests |
| --- | --- |
| `budget-plus-3-months.csv` | Sep–Nov 2026 with a **Category** column matching the table above, including the car insurance payment, a refund, and some uncategorized coffee. |
| `checking-account-style.csv` | A typical checking export: spending is negative and there are no categories, so **Invert amounts** starts checked. Paychecks are left out of this file. |
| `messy-rows.csv` | Odd but valid formats (short dates, `$` signs, `(18.00)`, quoted commas) and 5 bad rows the preview should report. |
| `5000-transactions.csv` | A year of 5,000 transactions, for checking the dashboard stays fast (NFR-4). |

Importing a file twice is safe: transactions you already have are skipped.
