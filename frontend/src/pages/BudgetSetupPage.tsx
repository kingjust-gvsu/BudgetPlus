import { CategoriesSection } from '../components/CategoriesSection'
import { IncomeSection } from '../components/IncomeSection'

export function BudgetSetupPage() {
  return (
    <>
      <h1>Budget setup</h1>
      <p className="page-intro">Enter your income and bills, then set spending limits for your expenses.</p>
      <IncomeSection />
      <CategoriesSection />
    </>
  )
}
