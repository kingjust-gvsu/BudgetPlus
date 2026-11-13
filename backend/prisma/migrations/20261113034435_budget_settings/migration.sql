-- CreateEnum
CREATE TYPE "BudgetType" AS ENUM ('FIXED', 'PERCENT_OF_INCOME', 'REMAINDER');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "budget_cents" INTEGER,
ADD COLUMN     "budget_percent_hundredths" INTEGER,
ADD COLUMN     "budget_type" "BudgetType" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "frequency_months" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "next_due_date" DATE;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "monthly_income_cents" INTEGER;
