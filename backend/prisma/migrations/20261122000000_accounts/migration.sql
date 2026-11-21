-- Accounts: where money is kept (bank accounts, credit cards, savings funds). Every transaction now
-- belongs to an account; existing transactions go into a "Checking" account.

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BANK', 'CREDIT_CARD', 'FUND');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "starting_balance_cents" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_name_key" ON "accounts"("user_id", "name");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Each user with transactions gets a "Checking" account starting at $0 on their first transaction's
-- day, and every transaction moves into it.
INSERT INTO "accounts" ("id", "user_id", "name", "type", "starting_balance_cents", "start_date")
SELECT gen_random_uuid(), t."user_id", 'Checking', 'BANK', 0, MIN(t."date")
FROM "transactions" t
GROUP BY t."user_id";

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "account_id" UUID;

UPDATE "transactions" t SET "account_id" = a."id" FROM "accounts" a WHERE a."user_id" = t."user_id";

ALTER TABLE "transactions" ALTER COLUMN "account_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
