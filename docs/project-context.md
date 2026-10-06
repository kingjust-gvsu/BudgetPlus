# Project Context & Working Decisions

Background and decisions from the proposal-planning discussions that aren't captured in the
submitted proposal. Items are marked **Decided** (agreed on) or **Proposed** (suggested, not yet
confirmed by the team). Revisit and update this as the project evolves.

## Course

- **Course:** SE 511 — Intro to Software Engineering (GVSU), instructor Reihaneh Hariri.
- **Path:** Application Development Project. Proposal submitted September 24, 2026.
- **Remaining deliverables:** periodic progress checkpoints, then the technical artifact (source
  code), software engineering artifacts, a final report, and a final presentation + demo.
- **Grading weights:**

  | Component                                  | Weight | What it needs                                                               |
  | ------------------------------------------ | ------ | --------------------------------------------------------------------------- |
  | Proposal                                   | 10%    | Done                                                                        |
  | Requirements                               | 20%    | Functional + non-functional requirements, models, traceability             |
  | Software design                            | 25%    | Architecture, design models, justified design decisions/patterns           |
  | Implementation & testing                   | 20%    | Working code, tests, evidence of evaluation, known limitations             |
  | Project management                         | 10%    | Roles/contributions, WBS or backlog, estimates, project board/sprint plan  |
  | Final report & presentation                | 15%    | Professional report and demo, all members participate                      |

- **Checkpoint updates** cover: work completed, technical progress, challenges, next steps, and
  each member's contributions.

## Team roles — Decided

| Member         | Primary responsibilities                                                    |
| -------------- | --------------------------------------------------------------------------- |
| Justin King    | Project coordination, frontend (React) and UI/UX, requirements and analysis |
| Ryley Rawlings | Backend (Express) and API design, database, budget calculation logic, test planning and QA |

The frontend and backend are separate projects so each person has a clear area of ownership
(fewer merge conflicts, easy to show individual contributions). Because the core budget math lives
in the backend, Justin should review that code closely.

## Tech stack

- **Decided:** React + TypeScript frontend, Express.js backend, PostgreSQL database, Firebase
  Authentication for sign-up/login only.
- **Why Express over Next.js:** the app is login-only and dashboard-style, so Next.js's SEO and
  server-rendering strengths don't apply. A standalone API keeps the budget logic in one clearly
  separated, testable place, and it fits the frontend/backend ownership split.
- **Why PostgreSQL over Firestore:** the data is relational (transactions → categories, bills →
  funds), and totals like "all grocery spending in October" are natural in SQL.
- **Proposed:** Prisma as the ORM, so the backend can define tables in a schema file and avoid
  raw SQL while learning Express + PostgreSQL.
- **Proposed tooling:** Vitest/Jest (unit), Supertest (API), Playwright (end-to-end), GitHub
  Actions (CI), GitHub Projects (board), pull-request code review.

### Authentication flow

1. The frontend signs the user in with Firebase Auth and receives an ID token.
2. Every API request sends that token to Express.
3. Express verifies it with the Firebase Admin SDK and uses the verified Firebase UID to load only
   that user's data.
4. PostgreSQL identifies users by Firebase UID — there is no password table.

## Domain rules

### Bills vs. expenses — Decided

|                   | Bill                                        | Expense                              |
| ----------------- | ------------------------------------------- | ------------------------------------ |
| Meaning           | Costs what it costs; mostly out of your control | You choose whether to spend          |
| Examples          | Electric, water, rent, phone, insurance     | Groceries, gas, eating out           |
| Budget amount     | An **estimate**                             | A **limit**                          |
| Status            | Pending → Paid                              | Under / over limit                   |
| Color             | Always neutral — no judgment                | Green if under, red if over          |
| Display           | "Est. $120 · Actual $134"                   | "$310 of $400 spent"                 |

### Budget types — Decided

Each category's amount is one of:

- **Fixed amount** (e.g. Rent = $1,200)
- **Percent of income** (e.g. Groceries = 12% of income)
- **Remainder** — whatever is left after everything else. Only one category can be the remainder.

Bills use a fixed estimate only. Expenses can be fixed or a percent of income.

This replaced an earlier idea of user-typed formulas (`0.12 * Income`). That idea was dropped
deliberately to keep the app simple: no parser, syntax errors, or circular references.

### Automatic spending-limit estimates — Proposed definition

Money left after estimated bills is divided among expense categories by default percentages,
which the user can adjust or override with any budget type above.

### Bill variance — Proposed

When a bill comes in above or below its estimate, the **remainder category absorbs the
difference**. Example: income $4,000, Electric estimated at $120, Fun Money (remainder) at $300.
Electric posts at $134 → Electric shows Paid (neutral), and Fun Money drops to $286. Nothing turns
red.

### Periodic bills (sinking funds) — Decided

For bills not paid monthly (e.g. car insurance: $600 every 6 months):

- A bill has a **frequency** (monthly or every N months) and a **next due date**.
- The app calculates a **monthly set-aside** ($600 ÷ 6 = $100/month). It counts against each
  month's budget **automatically**, without the user checking a box, even though the money stays in
  the bank account.
- When the bill is paid, the payment comes **from the fund**, not from that month's budget, so
  that month looks normal.
- Any difference between the actual bill and the fund follows the same remainder rule as monthly bills.
- **Fund balance is calculated, not stored:** set-asides so far − payments from the fund. No
  scheduled jobs or balances to keep in sync.
- **Catch-up edge case:** if there's less time left than a full cycle (added in January, due in
  March), spread the full amount over the remaining months ($600 ÷ 2 = $300/month), then return
  to $100/month after the payment.

Acceptance example: car insurance is $600 every 6 months and the fund holds $600. When a $600
payment is categorized as Car Insurance, the fund drops to $0, that month's available budget is
unchanged, and the next cycle starts at $100/month.

### Transactions & import

- **Decided:** manual entry plus CSV import from bank exports. No bank connections.
- **Proposed:** CSV import uses a column mapping (which column is date / description / amount),
  since every bank formats exports differently.
- **Proposed:** one simple auto-categorization rule type: "description contains X → category Y."
- **Proposed:** export all data to CSV (no lock-in).
- **Could-haves:** saved mappings per bank, duplicate detection on import, re-running rules on
  past transactions.

## Scope boundaries

- **Out of scope:** live bank connections (Plaid, etc.), investment tracking, native mobile apps,
  multiple currencies.
- **Future work:** pay-period (biweekly) budgets, custom fields on transactions, XLSX export,
  sinking funds for irregular *expenses* (e.g. holiday gifts).

## Non-functional requirements — Draft

1. **Security:** authentication via Firebase Auth; every backend request is verified, and users can
   only access their own data.
2. **Accuracy:** all money is stored as integer cents (or a decimal type), never floating point.
3. **Performance:** dashboard loads in under 2 seconds with ~5,000 transactions.
4. **Usability:** a new user can set up a basic budget (or import a CSV and set a budget) in
   under 5 minutes.
5. **Maintainability:** at least 80% unit-test coverage on budget and fund calculations.

## Design direction

- Keep the design **easy to change and easy to test**:
  - Imported bank files are translated into one standard transaction format, so supporting a new
    bank doesn't affect the rest of the app (*Adapter*).
  - Rules for each category kind (expense, monthly bill, periodic bill) and each budget type live
    in their own separate pieces of code (*Strategy*). New types can be added without changing
    existing ones.
  - Database access is kept separate from budget calculations, so the calculations can be
    unit-tested without a database (*Repository*).
- Pattern names are noted above for the design phase. The team prefers **plain-language
  explanations** over jargon in documents and presentations.
- **Agree on the API contract early** (endpoints, inputs, outputs). The frontend can then be built
  against fake data while the backend is in progress, and the contract also serves as a design artifact.

## Process

- Agile (Scrum-style), with **two-week sprints**, each ending in a working increment and a review.
  The team acts as its own product owner.
- **Draft schedule** (from proposal planning; adjust to the real course calendar):

  | Week    | Dates           | Focus                                                              |
  | ------- | --------------- | ------------------------------------------------------------------ |
  | 1       | Sep 28 – Oct 2  | Requirements, user stories, backlog, project board                 |
  | 2       | Oct 5 – Oct 9   | Design: architecture, data model, wireframes, API contract         |
  | 3–4     | Oct 12 – Oct 23 | Sprint 1: project skeleton, CI, auth, transactions, CSV import     |
  | 5–6     | Oct 26 – Nov 6  | Sprint 2: categories, budget types, bills/funds, dashboard         |
  | 7–8     | Nov 9 – Nov 20  | Sprint 3: rules, export, charts, polish                            |
  | 9       | Nov 23 – Nov 27 | Hardening and buffer (Thanksgiving)                                |
  | 10      | Nov 30 – Dec 4  | Final report, presentation, demo                                   |

## Naming

The working name was "Gridwise" before the team settled on **Budget+**. Because a `+` can't be used
in repo names or URLs, use `budget-plus` / `budgetplus` in those places.
