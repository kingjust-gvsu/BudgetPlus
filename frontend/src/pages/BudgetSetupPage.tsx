import { CategoriesSection } from '../components/CategoriesSection'
import { IncomeSection } from '../components/IncomeSection'

export function BudgetSetupPage() {
  return (
    <>
      <h1 className="page-title">Budget setup</h1>
      <IncomeSection />
      <CategoriesSection />
    </>
  )
}
