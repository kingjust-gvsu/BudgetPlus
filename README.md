# Budget+

A personal budgeting web app that respects the difference between **bills** and **expenses**.

## Why Budget+?

Budgeting is a vital daily task, but it's also complicated. Plenty of budgeting apps exist, yet
many people fall back on spreadsheets because they're flexible — at the cost of being manual,
error-prone, and time-consuming to maintain. Budget+ aims to keep that flexibility while doing
the tedious math for you.

Users enter their estimated income and bills, and Budget+ generates spending limits for expense
categories (groceries, gas, etc.). As expenses happen, the app tracks whether spending is within
those limits.

## Core concepts

- **Bills** are costs that are mostly out of your control (rent, electric, insurance). Each has an
  **estimate**, and bills are always shown in neutral colors. A high electric bill isn't a failure;
  it is what it is. Any difference from the estimate is absorbed by the remainder category.
- **Expenses** are spending you choose (groceries, gas, eating out). Each has a **limit** and is
  shown in **green** when under the limit and **red** when over.
- **Periodic bills** (e.g. car insurance every 6 months) get a *sinking fund*: the app sets aside a
  monthly amount automatically, so the money is ready when the bill is due. The payment then
  comes out of the fund instead of that month's budget.

## Features

- **Automatic expense limits** — calculated from estimated income and the estimated monthly bill
  total.
- **Bill & expense tracking** — list views comparing actual bills to estimates and actual spending
  to limits.
- **Flexible limits** — override the generated limits with your own, defined as:
  - a fixed amount,
  - a percentage of estimated income, or
  - the remainder after all other limits are calculated.
- **Dashboard** — a simple, easy-to-read summary of current spending vs. estimates and limits.
- **Transaction input** — manual entry, or import from CSV files exported from your bank.

### Out of scope

Budget+ does **not** connect to bank systems or store banking credentials, and does not hold
sensitive personal data (SSNs, account numbers, etc.).

## Architecture

Budget+ is a full-stack web application, used through a browser on desktop or mobile.

```
Browser (React + TypeScript)
        │  HTTPS / JSON
        ▼
Express.js API  ──►  PostgreSQL
        ▲
        │  ID token verification
Firebase Authentication
```

| Layer    | Technology                     | Responsibility                         |
| -------- | ------------------------------ | -------------------------------------- |
| Frontend | React + TypeScript             | UI, dashboard, data entry, CSV upload  |
| Backend  | Express.js (Node + TypeScript) | Budgeting logic, REST API              |
| Database | PostgreSQL                     | Users' budgets, bills, and transactions |
| Auth     | Firebase Authentication        | Sign-up and login                      |

## Repository layout

```
frontend/   React + TypeScript app (Vite)
backend/    Express.js API
docs/       Project context and design notes
```

## Getting started

**Prerequisites:** Node.js 24.15 or newer.

```bash
npm install
cp backend/.env.example backend/.env   # then adjust values if needed
npm run dev
```

`npm run dev` starts both projects together:

- Frontend: http://localhost:5173
- API: http://localhost:4000 (the frontend forwards `/api/*` requests here)

Other commands, run from the repo root, apply to both projects:

| Command             | What it does                    |
| ------------------- | ------------------------------- |
| `npm test`          | Run all tests                   |
| `npm run lint`      | Check code for common problems  |
| `npm run typecheck` | Check TypeScript types          |
| `npm run build`     | Build both projects for release |

CI runs lint, typecheck, tests, and build on every push to `main` and on every pull request.

See [docs/project-context.md](docs/project-context.md) for detailed domain rules, decisions, and
open questions.

## Development process

The team follows an **Agile** process: development happens in short sprints, each focused on a
goal and ending with a working increment of the product. Scope is expected to evolve over the
semester as priorities become clearer.

## Team

- **Justin King**: project coordination, frontend, UI/UX, requirements
- **Ryley Rawlings**: backend and API, database, budget logic, testing/QA

Built for SE 511 (Intro to Software Engineering).
