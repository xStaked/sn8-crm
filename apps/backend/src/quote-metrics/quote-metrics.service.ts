import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListQuoteMetricsDto } from './dto/list-quote-metrics.dto';
import {
  QuoteMetricsSummaryDto,
  QuoteOutcomeCaptureResultDto,
} from './dto/quote-metrics-summary.dto';
import {
  QuoteOutcomeStatusDto,
  RecordQuoteOutcomeDto,
} from './dto/record-quote-outcome.dto';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class QuoteMetricsService {
  private readonly logger = new Logger(QuoteMetricsService.name);
  private static readonly DEFAULT_WINDOW_DAYS = 30;
  private static readonly MONTHLY_RECALIBRATION_STEPS = [
    'Exportar cierres won/lost del ultimo mes por categoria/complejidad/integracion.',
    'Calcular MAE porcentual y tasa de aprobacion/retrabajo por segmento.',
    'Actualizar o versionar reglas comerciales con deltas >5% y validar en CRM.',
    'Publicar version activa y documentar cambios para el siguiente ciclo mensual.',
  ];

  constructor(private readonly prisma: PrismaService) {}

  async recordOutcome(dto: RecordQuoteOutcomeDto): Promise<QuoteOutcomeCaptureResultDto> {
    const normalizedConversationId = dto.conversationId.trim();
    if (!normalizedConversationId) {
      throw new BadRequestException('conversationId is required.');
    }

    const finalAmount =
      dto.finalAmount ?? (dto.outcomeStatus === QuoteOutcomeStatusDto.WON ? undefined : 0);
    if (finalAmount === undefined || finalAmount < 0) {
      throw new BadRequestException(
        'finalAmount is required for won outcomes and must be non-negative.',
      );
    }

    const closedAt = dto.closedAt ? new Date(dto.closedAt) : new Date();
    if (Number.isNaN(closedAt.getTime())) {
      throw new BadRequestException('closedAt must be a valid ISO date string.');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const draft = await this.resolveDraft(tx, normalizedConversationId, dto.quoteDraftId);
      const snapshot = await this.resolveOrCreateSnapshot(tx, {
        dto,
        conversationId: normalizedConversationId,
        draftId: draft?.id ?? null,
        pricingRuleId: draft?.pricingRuleId ?? null,
      });

      const outcome = await tx.quoteOutcome.upsert({
        where: { quoteEstimateSnapshotId: snapshot.id },
        update: {
          quoteDraftId: draft?.id ?? null,
          currency: this.normalizeCurrency(dto.currency ?? snapshot.currency),
          finalAmount,
          outcomeStatus: dto.outcomeStatus,
          closedAt,
          notes: this.normalizeOptionalText(dto.notes),
        },
        create: {
          conversationId: normalizedConversationId,
          quoteDraftId: draft?.id ?? null,
          quoteEstimateSnapshotId: snapshot.id,
          currency: this.normalizeCurrency(dto.currency ?? snapshot.currency),
          finalAmount,
          outcomeStatus: dto.outcomeStatus,
          closedAt,
          notes: this.normalizeOptionalText(dto.notes),
        },
      });

      return { snapshot, outcome };
    });

    const estimatedTargetAmount = Number(created.snapshot.estimatedTargetAmount);
    const normalizedFinalAmount = Number(created.outcome.finalAmount);
    const deltaAmount = normalizedFinalAmount - estimatedTargetAmount;
    const deltaPct =
      estimatedTargetAmount > 0
        ? Number(((deltaAmount / estimatedTargetAmount) * 100).toFixed(2))
        : 0;

    const result = {
      outcomeId: created.outcome.id,
      quoteEstimateSnapshotId: created.snapshot.id,
      outcomeStatus: created.outcome.outcomeStatus,
      finalAmount: normalizedFinalAmount,
      estimatedTargetAmount,
      deltaAmount,
      deltaPct,
      closedAt: created.outcome.closedAt.toISOString(),
    };

    this.logger.log({
      event: 'quote_metrics_outcome_recorded',
      conversationId: normalizedConversationId,
      quoteOutcomeId: result.outcomeId,
      quoteEstimateSnapshotId: result.quoteEstimateSnapshotId,
      quoteDraftId: created.outcome.quoteDraftId,
      pricingRuleId: created.snapshot.pricingRuleId,
      outcomeStatus: result.outcomeStatus,
      currency: created.outcome.currency,
      estimatedTargetAmount,
      finalAmount: normalizedFinalAmount,
      deltaAmount: result.deltaAmount,
      deltaPct: result.deltaPct,
      closedAt: result.closedAt,
    });

    return result;
  }

  async getSummary(filters: ListQuoteMetricsDto): Promise<QuoteMetricsSummaryDto> {
    const to = filters.to ?? new Date();
    const from = filters.from ?? new Date(to.getTime() - QuoteMetricsService.DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    if (from > to) {
      throw new BadRequestException('from must be less than or equal to to.');
    }

    const [outcomes, drafts, reviewEvents] = await Promise.all([
      this.prisma.quoteOutcome.findMany({
        where: { closedAt: { gte: from, lte: to } },
        select: {
          outcomeStatus: true,
          finalAmount: true,
          quoteEstimateSnapshot: {
            select: {
              estimatedTargetAmount: true,
            },
          },
        },
      }),
      this.prisma.quoteDraft.findMany({
        where: {
          OR: [
            { approvedAt: { gte: from, lte: to } },
            { deliveredToCustomerAt: { gte: from, lte: to } },
          ],
        },
        select: {
          createdAt: true,
          approvedAt: true,
          deliveredToCustomerAt: true,
        },
      }),
      this.prisma.quoteReviewEvent.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          reviewStatus: {
            in: ['approved', 'changes_requested'],
          },
        },
        select: {
          reviewStatus: true,
        },
      }),
    ]);

    const totalOutcomes = outcomes.length;
    const wonOutcomes = outcomes.filter((item) => item.outcomeStatus === 'won').length;
    const lostOutcomes = outcomes.filter((item) => item.outcomeStatus === 'lost').length;
    const pendingOutcomes = outcomes.filter((item) => item.outcomeStatus === 'pending').length;

    const precisionRows = outcomes.filter(
      (item) => Number(item.quoteEstimateSnapshot.estimatedTargetAmount) > 0,
    );
    const maePct =
      precisionRows.length > 0
        ? precisionRows.reduce((acc, item) => {
            const estimated = Number(item.quoteEstimateSnapshot.estimatedTargetAmount);
            const actual = Number(item.finalAmount);
            return acc + Math.abs(((actual - estimated) / estimated) * 100);
          }, 0) / precisionRows.length
        : 0;

    const avgDeltaAmount =
      precisionRows.length > 0
        ? precisionRows.reduce((acc, item) => {
            const estimated = Number(item.quoteEstimateSnapshot.estimatedTargetAmount);
            const actual = Number(item.finalAmount);
            return acc + (actual - estimated);
          }, 0) / precisionRows.length
        : 0;

    const quoteDurationsHours = drafts
      .map((draft) => {
        const finishedAt = draft.deliveredToCustomerAt ?? draft.approvedAt;
        if (!finishedAt) {
          return null;
        }
        return (finishedAt.getTime() - draft.createdAt.getTime()) / (1000 * 60 * 60);
      })
      .filter((value): value is number => value !== null && value >= 0);
    const avgQuoteTurnaroundHours =
      quoteDurationsHours.length > 0
        ? quoteDurationsHours.reduce((acc, hours) => acc + hours, 0) /
          quoteDurationsHours.length
        : 0;

    const approvals = reviewEvents.filter((event) => event.reviewStatus === 'approved').length;
    const changesRequested = reviewEvents.filter(
      (event) => event.reviewStatus === 'changes_requested',
    ).length;
    const reviewEventsTotal = approvals + changesRequested;
    const approvalRatePct =
      reviewEventsTotal > 0 ? (approvals / reviewEventsTotal) * 100 : 0;
    const reworkRatePct =
      reviewEventsTotal > 0 ? (changesRequested / reviewEventsTotal) * 100 : 0;

    const monthlyRecalibrationRecommended =
      totalOutcomes >= 5 && (Math.abs(avgDeltaAmount) > 0 || maePct >= 5);

    const summary = {
      window: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totalOutcomes,
      wonOutcomes,
      lostOutcomes,
      pendingOutcomes,
      approvalRatePct: Number(approvalRatePct.toFixed(2)),
      reworkRatePct: Number(reworkRatePct.toFixed(2)),
      avgQuoteTurnaroundHours: Number(avgQuoteTurnaroundHours.toFixed(2)),
      meanAbsoluteErrorPct: Number(maePct.toFixed(2)),
      avgDeltaAmount: Number(avgDeltaAmount.toFixed(2)),
      monthlyRecalibration: {
        recommended: monthlyRecalibrationRecommended,
        reason: monthlyRecalibrationRecommended
          ? 'El desempeño de estimación/revisión sugiere recalibración en este ciclo.'
          : 'No hay suficiente señal para recalibrar reglas en esta ventana.',
        steps: [...QuoteMetricsService.MONTHLY_RECALIBRATION_STEPS],
      },
    };

    this.logger.log({
      event: 'quote_metrics_summary_generated',
      from: summary.window.from,
      to: summary.window.to,
      totalOutcomes: summary.totalOutcomes,
      wonOutcomes: summary.wonOutcomes,
      lostOutcomes: summary.lostOutcomes,
      pendingOutcomes: summary.pendingOutcomes,
      approvalRatePct: summary.approvalRatePct,
      reworkRatePct: summary.reworkRatePct,
      avgQuoteTurnaroundHours: summary.avgQuoteTurnaroundHours,
      meanAbsoluteErrorPct: summary.meanAbsoluteErrorPct,
      avgDeltaAmount: summary.avgDeltaAmount,
      monthlyRecalibrationRecommended: summary.monthlyRecalibration.recommended,
    });

    return summary;
  }

  private async resolveDraft(
    tx: TxClient,
    conversationId: string,
    quoteDraftId?: string,
  ): Promise<{ id: string; pricingRuleId: string | null } | null> {
    if (!quoteDraftId) {
      return tx.quoteDraft.findFirst({
        where: { conversationId },
        orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
        select: { id: true, pricingRuleId: true },
      });
    }

    const draft = await tx.quoteDraft.findFirst({
      where: {
        id: quoteDraftId,
        conversationId,
      },
      select: {
        id: true,
        pricingRuleId: true,
      },
    });

    if (!draft) {
      throw new NotFoundException(
        `Quote draft ${quoteDraftId} was not found for conversation ${conversationId}.`,
      );
    }

    return draft;
  }

  private async resolveOrCreateSnapshot(
    tx: TxClient,
    input: {
      dto: RecordQuoteOutcomeDto;
      conversationId: string;
      draftId: string | null;
      pricingRuleId: string | null;
    },
  ) {
    if (input.dto.quoteEstimateSnapshotId) {
      const existing = await tx.quoteEstimateSnapshot.findUnique({
        where: { id: input.dto.quoteEstimateSnapshotId },
      });

      if (!existing || existing.conversationId !== input.conversationId) {
        throw new NotFoundException(
          `Quote estimate snapshot ${input.dto.quoteEstimateSnapshotId} was not found for conversation ${input.conversationId}.`,
        );
      }

      return existing;
    }

    if (
      input.dto.estimatedMinAmount === undefined ||
      input.dto.estimatedTargetAmount === undefined ||
      input.dto.estimatedMaxAmount === undefined
    ) {
      throw new BadRequestException(
        'estimatedMinAmount, estimatedTargetAmount and estimatedMaxAmount are required when quoteEstimateSnapshotId is not provided.',
      );
    }

    if (
      !(
        input.dto.estimatedMinAmount <= input.dto.estimatedTargetAmount &&
        input.dto.estimatedTargetAmount <= input.dto.estimatedMaxAmount
      )
    ) {
      throw new BadRequestException(
        'Invalid estimate window: expected estimatedMinAmount <= estimatedTargetAmount <= estimatedMaxAmount.',
      );
    }

    const currency = this.normalizeCurrency(input.dto.currency);

    return tx.quoteEstimateSnapshot.create({
      data: {
        conversationId: input.conversationId,
        quoteDraftId: input.draftId,
        pricingRuleId: input.pricingRuleId,
        currency,
        estimatedMinAmount: input.dto.estimatedMinAmount,
        estimatedTargetAmount: input.dto.estimatedTargetAmount,
        estimatedMaxAmount: input.dto.estimatedMaxAmount,
        inputPayload: {
          source: 'crm_outcome_capture',
          capturedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }

  private normalizeCurrency(value?: string): string {
    const normalized = (value ?? 'COP').trim().toUpperCase();
    return normalized || 'COP';
  }

  private normalizeOptionalText(value?: string): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
