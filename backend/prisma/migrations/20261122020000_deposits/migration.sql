-- Deposits: money coming in can be tagged with the income source it's from (a paycheck) or marked
-- as other income (a bonus). Income isn't spending.

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "income_source_id" UUID,
ADD COLUMN "is_other_income" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_income_source_id_fkey" FOREIGN KEY ("income_source_id") REFERENCES "income_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
