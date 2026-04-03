-- AlterTable
ALTER TABLE "PricingRule"
ADD COLUMN "category" TEXT NOT NULL DEFAULT 'general',
ADD COLUMN "complexity" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN "integrationType" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "QuoteDraft"
ADD COLUMN "pricingRuleId" TEXT,
ADD COLUMN "pricingRuleVersion" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_category_complexity_integrationType_version_key"
ON "PricingRule"("category", "complexity", "integrationType", "version");

-- CreateIndex
CREATE INDEX "PricingRule_category_complexity_integrationType_isActive_version_idx"
ON "PricingRule"("category", "complexity", "integrationType", "isActive", "version");

-- CreateIndex
CREATE INDEX "QuoteDraft_pricingRuleId_pricingRuleVersion_createdAt_idx"
ON "QuoteDraft"("pricingRuleId", "pricingRuleVersion", "createdAt");

-- AddForeignKey
ALTER TABLE "QuoteDraft"
ADD CONSTRAINT "QuoteDraft_pricingRuleId_fkey"
FOREIGN KEY ("pricingRuleId") REFERENCES "PricingRule"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
