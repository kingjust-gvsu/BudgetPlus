-- Transfers: a transaction can move money from its account to another one (paying off a credit
-- card, saving into a fund). Transfers aren't spending.

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "transfer_account_id" UUID;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_account_id_fkey" FOREIGN KEY ("transfer_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
