import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingRulesService } from './pricing-rules.service';

describe('PricingRulesService', () => {
  let prisma: {
    pricingRule: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let service: PricingRulesService;

  beforeEach(() => {
    prisma = {
      pricingRule: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation((callback: (tx: any) => any) =>
      callback(prisma),
    );

    service = new PricingRulesService(prisma as unknown as PrismaService);
  });

  it('creates next version and archives previously active rule with same key', async () => {
    prisma.pricingRule.findFirst.mockResolvedValue({ version: 2 });
    prisma.pricingRule.create.mockResolvedValue({
      id: 'rule_3',
      name: 'CRM medium ERP',
      category: 'crm',
      complexity: 'medium',
      integrationType: 'erp',
      version: 3,
      currency: 'COP',
      minMarginPct: { toFixed: () => '10.00' },
      targetMarginPct: { toFixed: () => '20.00' },
      maxMarginPct: { toFixed: () => '30.00' },
      isActive: true,
      description: null,
      archivedAt: null,
      createdAt: new Date('2026-04-03T22:00:00.000Z'),
      updatedAt: new Date('2026-04-03T22:00:00.000Z'),
    });

    const created = await service.createRule({
      name: 'CRM medium ERP',
      category: 'CRM',
      complexity: 'Medium',
      integrationType: 'ERP',
      minMarginPct: 10,
      targetMarginPct: 20,
      maxMarginPct: 30,
    });

    expect(prisma.pricingRule.updateMany).toHaveBeenCalledWith({
      where: {
        category: 'crm',
        complexity: 'medium',
        integrationType: 'erp',
        isActive: true,
        archivedAt: null,
      },
      data: {
        isActive: false,
        archivedAt: expect.any(Date),
      },
    });
    expect(prisma.pricingRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 3,
        category: 'crm',
        complexity: 'medium',
        integrationType: 'erp',
      }),
    });
    expect(created).toMatchObject({
      id: 'rule_3',
      version: 3,
      category: 'crm',
      complexity: 'medium',
      integrationType: 'erp',
    });
  });

  it('creates a new version during updates', async () => {
    prisma.pricingRule.findUnique.mockResolvedValue({
      id: 'rule_2',
      name: 'CRM medium ERP',
      category: 'crm',
      complexity: 'medium',
      integrationType: 'erp',
      version: 2,
      currency: 'COP',
      minMarginPct: 10,
      targetMarginPct: 20,
      maxMarginPct: 30,
      scoreWeights: null,
      confidenceWeights: null,
      isActive: true,
      description: null,
      archivedAt: null,
    });
    prisma.pricingRule.findFirst.mockResolvedValue({ version: 2 });
    prisma.pricingRule.create.mockResolvedValue({
      id: 'rule_3',
      name: 'CRM medium ERP (updated)',
      category: 'crm',
      complexity: 'medium',
      integrationType: 'erp',
      version: 3,
      currency: 'COP',
      minMarginPct: { toFixed: () => '12.00' },
      targetMarginPct: { toFixed: () => '22.00' },
      maxMarginPct: { toFixed: () => '32.00' },
      isActive: true,
      description: null,
      archivedAt: null,
      createdAt: new Date('2026-04-03T22:00:00.000Z'),
      updatedAt: new Date('2026-04-03T22:00:00.000Z'),
    });

    const updated = await service.updateRule('rule_2', {
      name: 'CRM medium ERP (updated)',
      minMarginPct: 12,
      targetMarginPct: 22,
      maxMarginPct: 32,
    });

    expect(prisma.pricingRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 3,
        name: 'CRM medium ERP (updated)',
      }),
    });
    expect(updated).toMatchObject({ id: 'rule_3', version: 3 });
  });

  it('rejects invalid margin windows', async () => {
    await expect(
      service.createRule({
        name: 'bad',
        category: 'crm',
        complexity: 'medium',
        integrationType: 'erp',
        minMarginPct: 20,
        targetMarginPct: 15,
        maxMarginPct: 40,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when archiving unknown rule', async () => {
    prisma.pricingRule.findUnique.mockResolvedValue(null);

    await expect(service.archiveRule('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
