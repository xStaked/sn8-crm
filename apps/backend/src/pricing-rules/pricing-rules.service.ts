import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { ListPricingRulesDto } from './dto/list-pricing-rules.dto';
import { PricingRuleDto } from './dto/pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';

type NormalizedRuleKey = {
  category: string;
  complexity: string;
  integrationType: string;
};

@Injectable()
export class PricingRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async listRules(filters: ListPricingRulesDto): Promise<PricingRuleDto[]> {
    const where: Prisma.PricingRuleWhereInput = {
      ...(filters.includeInactive ? {} : { archivedAt: null, isActive: true }),
      ...(filters.category
        ? { category: this.normalizeToken(filters.category) }
        : {}),
      ...(filters.complexity
        ? { complexity: this.normalizeToken(filters.complexity) }
        : {}),
      ...(filters.integrationType
        ? { integrationType: this.normalizeToken(filters.integrationType) }
        : {}),
    };

    const rows = await this.prisma.pricingRule.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { complexity: 'asc' },
        { integrationType: 'asc' },
        { version: 'desc' },
      ],
    });

    return rows.map((row) => this.toDto(row));
  }

  async getRule(ruleId: string): Promise<PricingRuleDto> {
    const row = await this.prisma.pricingRule.findUnique({
      where: { id: ruleId },
    });

    if (!row || row.archivedAt) {
      throw new NotFoundException(`Pricing rule ${ruleId} was not found.`);
    }

    return this.toDto(row);
  }

  async createRule(dto: CreatePricingRuleDto): Promise<PricingRuleDto> {
    this.assertMarginOrder(dto.minMarginPct, dto.targetMarginPct, dto.maxMarginPct);
    const key = this.normalizeRuleKey(dto);

    const created = await this.prisma.$transaction(async (tx) => {
      const latestForKey = await tx.pricingRule.findFirst({
        where: key,
        orderBy: { version: 'desc' },
      });

      const nextVersion = (latestForKey?.version ?? 0) + 1;
      const shouldActivate = dto.isActive ?? true;

      if (shouldActivate) {
        await tx.pricingRule.updateMany({
          where: {
            ...key,
            isActive: true,
            archivedAt: null,
          },
          data: {
            isActive: false,
            archivedAt: new Date(),
          },
        });
      }

      return tx.pricingRule.create({
        data: {
          name: dto.name.trim(),
          description: this.normalizeOptionalString(dto.description),
          ...key,
          version: nextVersion,
          currency: this.normalizeCurrency(dto.currency),
          minMarginPct: dto.minMarginPct,
          targetMarginPct: dto.targetMarginPct,
          maxMarginPct: dto.maxMarginPct,
          scoreWeights: (dto.scoreWeights ?? null) as Prisma.InputJsonValue,
          confidenceWeights: (dto.confidenceWeights ?? null) as Prisma.InputJsonValue,
          isActive: shouldActivate,
          archivedAt: shouldActivate ? null : new Date(),
        },
      });
    });

    return this.toDto(created);
  }

  async updateRule(ruleId: string, dto: UpdatePricingRuleDto): Promise<PricingRuleDto> {
    const current = await this.prisma.pricingRule.findUnique({
      where: { id: ruleId },
    });

    if (!current || current.archivedAt) {
      throw new NotFoundException(`Pricing rule ${ruleId} was not found.`);
    }

    const minMarginPct = dto.minMarginPct ?? Number(current.minMarginPct);
    const targetMarginPct = dto.targetMarginPct ?? Number(current.targetMarginPct);
    const maxMarginPct = dto.maxMarginPct ?? Number(current.maxMarginPct);
    this.assertMarginOrder(minMarginPct, targetMarginPct, maxMarginPct);

    const key = this.normalizeRuleKey({
      category: dto.category ?? current.category,
      complexity: dto.complexity ?? current.complexity,
      integrationType: dto.integrationType ?? current.integrationType,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const latestForKey = await tx.pricingRule.findFirst({
        where: key,
        orderBy: { version: 'desc' },
      });

      const nextVersion = Math.max(latestForKey?.version ?? 0, current.version) + 1;
      const shouldActivate = dto.isActive ?? true;

      if (shouldActivate) {
        await tx.pricingRule.updateMany({
          where: {
            ...key,
            isActive: true,
            archivedAt: null,
          },
          data: {
            isActive: false,
            archivedAt: new Date(),
          },
        });
      }

      return tx.pricingRule.create({
        data: {
          name: dto.name?.trim() ?? current.name,
          description:
            dto.description !== undefined
              ? this.normalizeOptionalString(dto.description)
              : current.description,
          ...key,
          version: nextVersion,
          currency: this.normalizeCurrency(dto.currency ?? current.currency),
          minMarginPct,
          targetMarginPct,
          maxMarginPct,
          scoreWeights: ((dto.scoreWeights ?? current.scoreWeights ?? null) as Prisma.InputJsonValue),
          confidenceWeights: ((dto.confidenceWeights ?? current.confidenceWeights ?? null) as Prisma.InputJsonValue),
          isActive: shouldActivate,
          archivedAt: shouldActivate ? null : new Date(),
        },
      });
    });

    return this.toDto(created);
  }

  async activateRule(ruleId: string): Promise<PricingRuleDto> {
    const target = await this.prisma.pricingRule.findUnique({
      where: { id: ruleId },
    });

    if (!target) {
      throw new NotFoundException(`Pricing rule ${ruleId} was not found.`);
    }

    const activated = await this.prisma.$transaction(async (tx) => {
      await tx.pricingRule.updateMany({
        where: {
          category: target.category,
          complexity: target.complexity,
          integrationType: target.integrationType,
          id: { not: target.id },
          isActive: true,
          archivedAt: null,
        },
        data: {
          isActive: false,
          archivedAt: new Date(),
        },
      });

      return tx.pricingRule.update({
        where: { id: target.id },
        data: {
          isActive: true,
          archivedAt: null,
        },
      });
    });

    return this.toDto(activated);
  }

  async archiveRule(ruleId: string): Promise<void> {
    const existing = await this.prisma.pricingRule.findUnique({
      where: { id: ruleId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Pricing rule ${ruleId} was not found.`);
    }

    await this.prisma.pricingRule.update({
      where: { id: ruleId },
      data: {
        isActive: false,
        archivedAt: new Date(),
      },
    });
  }

  private assertMarginOrder(min: number, target: number, max: number): void {
    if (!(min <= target && target <= max)) {
      throw new BadRequestException(
        'Invalid margin window: expected minMarginPct <= targetMarginPct <= maxMarginPct.',
      );
    }
  }

  private normalizeRuleKey(input: {
    category: string;
    complexity: string;
    integrationType: string;
  }): NormalizedRuleKey {
    return {
      category: this.normalizeToken(input.category),
      complexity: this.normalizeToken(input.complexity),
      integrationType: this.normalizeToken(input.integrationType),
    };
  }

  private normalizeToken(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('Rule categorization fields cannot be empty.');
    }

    return normalized;
  }

  private normalizeCurrency(value: string | undefined): string {
    const normalized = (value ?? 'COP').trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException('currency cannot be empty.');
    }

    return normalized;
  }

  private normalizeOptionalString(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private toDto(row: {
    id: string;
    name: string;
    category: string;
    complexity: string;
    integrationType: string;
    version: number;
    currency: string;
    minMarginPct: Prisma.Decimal;
    targetMarginPct: Prisma.Decimal;
    maxMarginPct: Prisma.Decimal;
    isActive: boolean;
    description: string | null;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): PricingRuleDto {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      complexity: row.complexity,
      integrationType: row.integrationType,
      version: row.version,
      currency: row.currency,
      minMarginPct: row.minMarginPct.toFixed(2),
      targetMarginPct: row.targetMarginPct.toFixed(2),
      maxMarginPct: row.maxMarginPct.toFixed(2),
      isActive: row.isActive,
      description: row.description,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
