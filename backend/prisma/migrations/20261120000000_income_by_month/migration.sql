-- Income can now differ by month: regular income sources whose amounts carry over from month to
-- month, plus one-off "other" income for a single month. Replaces users.monthly_income_cents.

-- CreateTable
CREATE TABLE "income_sources" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "income_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_amounts" (
    "source_id" UUID NOT NULL,
    "month" CHAR(7) NOT NULL,
    "amount_cents" INTEGER NOT NULL,

    CONSTRAINT "income_amounts_pkey" PRIMARY KEY ("source_id","month")
);

-- CreateTable
CREATE TABLE "other_income" (
    "user_id" UUID NOT NULL,
    "month" CHAR(7) NOT NULL,
    "amount_cents" INTEGER NOT NULL,

    CONSTRAINT "other_income_pkey" PRIMARY KEY ("user_id","month")
);

-- CreateIndex
CREATE UNIQUE INDEX "income_sources_user_id_name_key" ON "income_sources"("user_id", "name");

-- AddForeignKey
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_amounts" ADD CONSTRAINT "income_amounts_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "income_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_income" ADD CONSTRAINT "other_income_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep each user's existing income: it becomes a source called "Income", starting from the
-- earliest month they have any data, so every past month keeps the income it had.
INSERT INTO "income_sources" ("id", "user_id", "name")
SELECT gen_random_uuid(), "id", 'Income' FROM "users" WHERE "monthly_income_cents" IS NOT NULL;

INSERT INTO "income_amounts" ("source_id", "month", "amount_cents")
SELECT s."id",
       to_char(LEAST(
         u."created_at",
         COALESCE((SELECT MIN(t."date") FROM "transactions" t WHERE t."user_id" = u."id"), u."created_at"),
         COALESCE((SELECT MIN(c."created_at") FROM "categories" c WHERE c."user_id" = u."id"), u."created_at")
       ), 'YYYY-MM'),
       u."monthly_income_cents"
FROM "income_sources" s JOIN "users" u ON u."id" = s."user_id";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "monthly_income_cents";
