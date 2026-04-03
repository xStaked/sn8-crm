import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Prisma schema quote pricing contract', () => {
  it('declares durable pricing models and quote relations', () => {
    const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');

    expect(schema).toContain('model PricingRule');
    expect(schema).toMatch(/category\s+String/);
    expect(schema).toMatch(/complexity\s+String/);
    expect(schema).toMatch(/integrationType\s+String/);
    expect(schema).toMatch(/version\s+Int/);
    expect(schema).toMatch(/minMarginPct\s+Decimal/);
    expect(schema).toMatch(/targetMarginPct\s+Decimal/);
    expect(schema).toMatch(/maxMarginPct\s+Decimal/);

    expect(schema).toContain('model QuoteEstimateSnapshot');
    expect(schema).toMatch(/quoteDraftId\s+String\?/);
    expect(schema).toMatch(/pricingRuleId\s+String\?/);
    expect(schema).toMatch(/estimatedTargetAmount\s+Decimal/);
    expect(schema).toContain('@@index([conversationId, createdAt])');

    expect(schema).toContain('model QuoteOutcome');
    expect(schema).toMatch(/quoteEstimateSnapshotId\s+String\s+@unique/);
    expect(schema).toMatch(/finalAmount\s+Decimal/);
    expect(schema).toContain('@@index([outcomeStatus, closedAt])');

    expect(schema).toContain('estimateSnapshots     QuoteEstimateSnapshot[]');
    expect(schema).toContain('pricingRuleVersion    Int?');
    expect(schema).toContain('pricingRule           PricingRule?');
    expect(schema).toContain('outcomes              QuoteOutcome[]');
  });
});
