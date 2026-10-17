# Budget+

A personal budgeting web app that treats **bills** and **expenses** differently.

- **Bills** (rent, electric) are compared to an estimate and always shown neutrally.
- **Expenses** (groceries, gas) have a spending limit and show green when under, red when over.
- **Bills that aren't monthly** (car insurance) are saved for a little each month, so they never
  catch you off guard.

Built with React, Express, PostgreSQL, and Firebase sign-in for SE 511 by Justin King and Ryley
Rawlings.

## Development setup

You'll need **Node.js 24.15+** and **PostgreSQL**.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your settings files and fill them in:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env.local
   ```

   - `backend/.env`: your PostgreSQL password and the Firebase project ID
   - `frontend/.env.local`: the Firebase web app settings (ask a teammate)

3. Create the database:

   ```bash
   npm run db:migrate -w backend
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

   Open http://localhost:5173.

Run `npm test` to run all tests.
