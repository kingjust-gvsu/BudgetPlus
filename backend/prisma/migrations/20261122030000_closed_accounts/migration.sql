-- Closed accounts: no longer used, but they keep their transactions.

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "closed" BOOLEAN NOT NULL DEFAULT false;
