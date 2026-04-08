import { PrismaClient } from '@prisma/client';

type Category = 'landing_marketing' | 'web_operativa' | 'crm_sales' | 'vertical_saas' | 'automation_ia';
type Complexity = 'low' | 'medium' | 'high';
type IntegrationType = 'none' | 'standard' | 'advanced';

const categories: Category[] = [
  'landing_marketing',
  'web_operativa',
  'crm_sales',
  'vertical_saas',
  'automation_ia',
];
const complexities: Complexity[] = ['low', 'medium', 'high'];
const integrationTypes: IntegrationType[] = ['none', 'standard', 'advanced'];

const defaultScoreWeights = {
  complexity: 0.35,
  integrations: 0.25,
  urgency: 0.2,
  risk: 0.2,
};

const defaultConfidenceWeights = {
  transcriptQuality: 0.3,
  scopeClarity: 0.35,
  budgetClarity: 0.2,
  urgencyClarity: 0.15,
};

function resolveRiskTier(complexity: Complexity, integrationType: IntegrationType): 'low' | 'medium' | 'high' {
  if (complexity === 'high' || integrationType === 'advanced') {
    return 'high';
  }
  if (complexity === 'medium' || integrationType === 'standard') {
    return 'medium';
  }
  return 'low';
}

function resolveMargins(riskTier: 'low' | 'medium' | 'high') {
  if (riskTier === 'high') {
    return { minMarginPct: 30, targetMarginPct: 45, maxMarginPct: 60 };
  }
  if (riskTier === 'medium') {
    return { minMarginPct: 25, targetMarginPct: 35, maxMarginPct: 50 };
  }
  return { minMarginPct: 20, targetMarginPct: 30, maxMarginPct: 40 };
}

async function seedMatrix(prisma: PrismaClient) {
  let created = 0;
  let skipped = 0;

  for (const category of categories) {
    for (const complexity of complexities) {
      for (const integrationType of integrationTypes) {
        const riskTier = resolveRiskTier(complexity, integrationType);
        const margins = resolveMargins(riskTier);

        const latest = await prisma.pricingRule.findFirst({
          where: { category, complexity, integrationType },
          orderBy: { version: 'desc' },
        });

        if (
          latest &&
          latest.isActive &&
          latest.archivedAt === null &&
          latest.currency.toUpperCase() === 'COP' &&
          Number(latest.minMarginPct) === margins.minMarginPct &&
          Number(latest.targetMarginPct) === margins.targetMarginPct &&
          Number(latest.maxMarginPct) === margins.maxMarginPct
        ) {
          skipped += 1;
          continue;
        }

        const nextVersion = (latest?.version ?? 0) + 1;

        await prisma.$transaction(async (tx) => {
          await tx.pricingRule.updateMany({
            where: {
              category,
              complexity,
              integrationType,
              isActive: true,
              archivedAt: null,
            },
            data: {
              isActive: false,
              archivedAt: new Date(),
            },
          });

          await tx.pricingRule.create({
            data: {
              name: `Pricing v2 ${category} / ${complexity} / ${integrationType}`,
              description:
                `Regla v2 derivada por matriz categoria-complejidad-integracion (riesgo ${riskTier}).`,
              category,
              complexity,
              integrationType,
              version: nextVersion,
              currency: 'COP',
              minMarginPct: margins.minMarginPct,
              targetMarginPct: margins.targetMarginPct,
              maxMarginPct: margins.maxMarginPct,
              scoreWeights: defaultScoreWeights,
              confidenceWeights: defaultConfidenceWeights,
              isActive: true,
              archivedAt: null,
            },
          });
        });

        created += 1;
      }
    }
  }

  return { created, skipped };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await seedMatrix(prisma);
    // eslint-disable-next-line no-console
    console.log(
      `Pricing matrix v2 seed completed. Created: ${result.created}, skipped: ${result.skipped}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
