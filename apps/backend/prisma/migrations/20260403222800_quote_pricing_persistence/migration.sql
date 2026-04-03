-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "minMarginPct" DECIMAL(5,2) NOT NULL,
    "targetMarginPct" DECIMAL(5,2) NOT NULL,
    "maxMarginPct" DECIMAL(5,2) NOT NULL,
    "scoreWeights" JSONB,
    "confidenceWeights" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteEstimateSnapshot" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "quoteDraftId" TEXT,
    "pricingRuleId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "effortHours" DECIMAL(10,2),
    "complexityScore" DECIMAL(5,2),
    "confidencePct" INTEGER,
    "estimatedMinAmount" DECIMAL(14,2) NOT NULL,
    "estimatedTargetAmount" DECIMAL(14,2) NOT NULL,
    "estimatedMaxAmount" DECIMAL(14,2) NOT NULL,
    "breakdown" JSONB,
    "inputPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteEstimateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteOutcome" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "quoteDraftId" TEXT,
    "quoteEstimateSnapshotId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "finalAmount" DECIMAL(14,2) NOT NULL,
    "outcomeStatus" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricingRule_isActive_updatedAt_idx" ON "PricingRule"("isActive", "updatedAt");

-- CreateIndex
CREATE INDEX "QuoteEstimateSnapshot_conversationId_createdAt_idx" ON "QuoteEstimateSnapshot"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteEstimateSnapshot_quoteDraftId_createdAt_idx" ON "QuoteEstimateSnapshot"("quoteDraftId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteEstimateSnapshot_pricingRuleId_createdAt_idx" ON "QuoteEstimateSnapshot"("pricingRuleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteOutcome_quoteEstimateSnapshotId_key" ON "QuoteOutcome"("quoteEstimateSnapshotId");

-- CreateIndex
CREATE INDEX "QuoteOutcome_conversationId_closedAt_idx" ON "QuoteOutcome"("conversationId", "closedAt");

-- CreateIndex
CREATE INDEX "QuoteOutcome_quoteDraftId_closedAt_idx" ON "QuoteOutcome"("quoteDraftId", "closedAt");

-- CreateIndex
CREATE INDEX "QuoteOutcome_outcomeStatus_closedAt_idx" ON "QuoteOutcome"("outcomeStatus", "closedAt");

-- AddForeignKey
ALTER TABLE "QuoteEstimateSnapshot" ADD CONSTRAINT "QuoteEstimateSnapshot_quoteDraftId_fkey" FOREIGN KEY ("quoteDraftId") REFERENCES "QuoteDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEstimateSnapshot" ADD CONSTRAINT "QuoteEstimateSnapshot_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "PricingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteOutcome" ADD CONSTRAINT "QuoteOutcome_quoteDraftId_fkey" FOREIGN KEY ("quoteDraftId") REFERENCES "QuoteDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteOutcome" ADD CONSTRAINT "QuoteOutcome_quoteEstimateSnapshotId_fkey" FOREIGN KEY ("quoteEstimateSnapshotId") REFERENCES "QuoteEstimateSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
