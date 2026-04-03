import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuoteMetricsService } from './quote-metrics.service';

describe('QuoteMetricsService', () => {
  let prisma: any;
  let service: QuoteMetricsService;

  beforeEach(() => {
    prisma = {
      quoteDraft: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      quoteEstimateSnapshot: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      quoteOutcome: {
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
      quoteReviewEvent: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation((callback: (tx: any) => any) => callback(prisma));

    service = new QuoteMetricsService(prisma as unknown as PrismaService);
  });

  it('records a won outcome with a new snapshot when none is provided', async () => {
    prisma.quoteDraft.findFirst.mockResolvedValue({
      id: 'draft_1',
      pricingRuleId: 'rule_1',
    });
    prisma.quoteEstimateSnapshot.create.mockResolvedValue({
      id: 'snapshot_1',
      currency: 'COP',
      estimatedTargetAmount: 18000000,
    });
    prisma.quoteOutcome.upsert.mockResolvedValue({
      id: 'outcome_1',
      outcomeStatus: 'won',
      finalAmount: 18500000,
      closedAt: new Date('2026-04-03T19:00:00.000Z'),
    });

    const result = await service.recordOutcome({
      conversationId: '+573001112233',
      outcomeStatus: 'won',
      finalAmount: 18500000,
      estimatedMinAmount: 15000000,
      estimatedTargetAmount: 18000000,
      estimatedMaxAmount: 22000000,
    });

    expect(prisma.quoteEstimateSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: '+573001112233',
        quoteDraftId: 'draft_1',
        pricingRuleId: 'rule_1',
        estimatedTargetAmount: 18000000,
      }),
    });
    expect(prisma.quoteOutcome.upsert).toHaveBeenCalledWith({
      where: { quoteEstimateSnapshotId: 'snapshot_1' },
      update: expect.objectContaining({
        outcomeStatus: 'won',
        finalAmount: 18500000,
      }),
      create: expect.objectContaining({
        outcomeStatus: 'won',
        finalAmount: 18500000,
      }),
    });
    expect(result).toMatchObject({
      outcomeId: 'outcome_1',
      quoteEstimateSnapshotId: 'snapshot_1',
      deltaAmount: 500000,
      deltaPct: 2.78,
    });
  });

  it('requires estimated window when snapshot id is missing', async () => {
    prisma.quoteDraft.findFirst.mockResolvedValue({
      id: 'draft_1',
      pricingRuleId: null,
    });

    await expect(
      service.recordOutcome({
        conversationId: '+573001112233',
        outcomeStatus: 'lost',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when provided draft does not belong to conversation', async () => {
    prisma.quoteDraft.findFirst.mockResolvedValue(null);

    await expect(
      service.recordOutcome({
        conversationId: '+573001112233',
        quoteDraftId: 'draft_other',
        outcomeStatus: 'won',
        finalAmount: 100,
        estimatedMinAmount: 90,
        estimatedTargetAmount: 100,
        estimatedMaxAmount: 110,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('computes summary KPIs from stored outcomes, review events and drafts', async () => {
    prisma.quoteOutcome.findMany.mockResolvedValue([
      {
        outcomeStatus: 'won',
        finalAmount: 120,
        quoteEstimateSnapshot: { estimatedTargetAmount: 100 },
      },
      {
        outcomeStatus: 'lost',
        finalAmount: 70,
        quoteEstimateSnapshot: { estimatedTargetAmount: 100 },
      },
      {
        outcomeStatus: 'pending',
        finalAmount: 100,
        quoteEstimateSnapshot: { estimatedTargetAmount: 100 },
      },
    ]);
    prisma.quoteDraft.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-04-01T10:00:00.000Z'),
        approvedAt: new Date('2026-04-01T16:00:00.000Z'),
        deliveredToCustomerAt: null,
      },
      {
        createdAt: new Date('2026-04-02T09:00:00.000Z'),
        approvedAt: null,
        deliveredToCustomerAt: new Date('2026-04-02T15:00:00.000Z'),
      },
    ]);
    prisma.quoteReviewEvent.findMany.mockResolvedValue([
      { reviewStatus: 'approved' },
      { reviewStatus: 'changes_requested' },
      { reviewStatus: 'approved' },
    ]);

    const result = await service.getSummary({
      from: new Date('2026-04-01T00:00:00.000Z'),
      to: new Date('2026-04-03T00:00:00.000Z'),
    });

    expect(result).toMatchObject({
      totalOutcomes: 3,
      wonOutcomes: 1,
      lostOutcomes: 1,
      pendingOutcomes: 1,
      approvalRatePct: 66.67,
      reworkRatePct: 33.33,
      avgQuoteTurnaroundHours: 6,
      meanAbsoluteErrorPct: 16.67,
      avgDeltaAmount: -3.33,
    });
  });
});
