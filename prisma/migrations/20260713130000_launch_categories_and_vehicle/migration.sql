-- Categoria personalizada nos lançamentos + categoria livre no título a pagar.
ALTER TABLE "payables" ADD COLUMN "categoryLabel" TEXT;

CREATE TABLE "launch_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "launch_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "launch_categories_name_key" ON "launch_categories"("name");
