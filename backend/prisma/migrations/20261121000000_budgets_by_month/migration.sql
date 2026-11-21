-- Category budgets can now change from a month on, so past months keep the budget they had.
-- Each category's current budget becomes its first entry, starting in the month it was added.

-- CreateTable
CREATE TABLE "category_budgets" (
    "category_id" UUID NOT NULL,
    "month" CHAR(7) NOT NULL,
    "stopped" BOOLEAN NOT NULL DEFAULT false,
    "budget_type" "BudgetType" NOT NULL DEFAULT 'FIXED',
    "budget_cents" INTEGER,
    "budget_percent_hundredths" INTEGER,

    CONSTRAINT "category_budgets_pkey" PRIMARY KEY ("category_id","month")
);

-- AddForeignKey
ALTER TABLE "category_budgets" ADD CONSTRAINT "category_budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "category_budgets" ("category_id", "month", "budget_type", "budget_cents", "budget_percent_hundredths")
SELECT "id", to_char("created_at", 'YYYY-MM'), "budget_type", "budget_cents", "budget_percent_hundredths" FROM "categories";

-- AlterTable
ALTER TABLE "categories" DROP COLUMN "budget_cents",
DROP COLUMN "budget_percent_hundredths",
DROP COLUMN "budget_type";
