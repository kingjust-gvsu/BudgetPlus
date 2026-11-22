-- Buckets can sit in a bank account: its total is its own balance plus its buckets'.

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "parent_account_id" UUID;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_account_id_fkey" FOREIGN KEY ("parent_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
