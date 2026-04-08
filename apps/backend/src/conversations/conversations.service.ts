import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, QuoteReviewStatus } from '@prisma/client';
import { AiSalesOrchestrator } from '../ai-sales/ai-sales.orchestrator';
import { OwnerReviewAction } from '../ai-sales/dto/owner-review-command.dto';
import { OwnerReviewService } from '../ai-sales/owner-review.service';
import { BotConversationRepository } from '../bot-conversation/bot-conversation.repository';
import {
  BotConversationState,
  type BotConversationSnapshot,
  type ConversationControlMode,
} from '../bot-conversation/bot-conversation.types';
import { MessagingService } from '../messaging/messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuotePdfService } from '../quote-documents/quote-pdf.service';
import { ApproveQuoteDto } from './dto/approve-quote.dto';
import {
  ConversationQuoteReviewDto,
  PendingQuoteSummaryDto,
} from './dto/quote-review-response.dto';
import { ApplyOwnerAdjustmentsDto } from './dto/apply-owner-adjustments.dto';
import { RequestQuoteChangesDto } from './dto/request-quote-changes.dto';

type ConversationDirection = 'inbound' | 'outbound';

type MessageRow = {
  id: string;
  direction: string;
  fromPhone: string;
  toPhone: string;
  body: string | null;
  createdAt: Date;
  rawPayload?: unknown;
};

type MessageIdentityRow = Pick<
  MessageRow,
  'id' | 'direction' | 'fromPhone' | 'toPhone'
>;

type ConversationSummary = {
  id: string;
  contactName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  pendingQuote: PendingQuoteSummaryDto | null;
  conversationControl: {
    state: BotConversationState;
    control: ConversationControlMode;
    updatedAt: string;
    updatedBy: string;
  };
};

type ConversationMessage = {
  id: string;
  conversationId: string;
  direction: ConversationDirection;
  body: string | null;
  createdAt: string;
};

type ConversationQuoteReviewPdfFile = {
  conversationId: string;
  quoteDraftId: string;
  version: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  generatedAt: string;
  content: Buffer;
};

type ConversationControlUpdate = {
  conversationId: string;
  state: BotConversationState;
  control: ConversationControlMode;
  updatedAt: string;
  updatedBy: string;
};

type OwnerAdjustmentAuditEntry = {
  adjustedAt: string;
  adjustedBy: string;
  previousRange: {
    min: number;
    target: number;
    max: number;
  };
  adjustedRange: {
    min: number;
    target: number;
    max: number;
  };
  assumptions: string[];
  reason: string | null;
};

type QuoteLifecycleState =
  | 'idle'
  | 'brief_collecting'
  | 'brief_complete'
  | 'quote_draft_ready'
  | 'quote_sent'
  | 'quote_archived';

const messageProjection = {
  id: true,
  direction: true,
  fromPhone: true,
  toPhone: true,
  body: true,
  createdAt: true,
} as const;

const messageProjectionWithRawPayload = {
  ...messageProjection,
  rawPayload: true,
} as const;

const reviewRelevantStatuses = [
  'pending_owner_review',
  'ready_for_recheck',
  'changes_requested',
  'approved',
  'delivered_to_customer',
] as const;

const actionableReviewStatuses = [
  'pending_owner_review',
  'ready_for_recheck',
] as const satisfies readonly QuoteReviewStatus[];

function isActionableReviewStatus(
  status: QuoteReviewStatus,
): status is (typeof actionableReviewStatuses)[number] {
  return (actionableReviewStatuses as readonly QuoteReviewStatus[]).includes(status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  private readonly botConversationTtlSeconds = 24 * 60 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingService: MessagingService,
    private readonly config: ConfigService,
    private readonly ownerReviewService: OwnerReviewService,
    private readonly quotePdfService: QuotePdfService,
    @Inject(forwardRef(() => AiSalesOrchestrator))
    private readonly aiSalesOrchestrator: AiSalesOrchestrator,
    private readonly botConversationRepository: BotConversationRepository,
  ) {}

  async transferControlToHuman(
    conversationId: string,
    actorIdentity: string,
  ): Promise<ConversationControlUpdate> {
    return this.updateConversationControl(conversationId, 'human_control', actorIdentity);
  }

  async returnControlToAi(
    conversationId: string,
    actorIdentity: string,
  ): Promise<ConversationControlUpdate> {
    return this.updateConversationControl(conversationId, 'pending_resume', actorIdentity);
  }

  async listConversations(): Promise<ConversationSummary[]> {
    const messages = await this.prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      select: messageProjection,
    });

    const summaries = new Map<string, ConversationSummary>();

    for (const message of messages) {
      const conversationId = this.getStableConversationId(message);

      if (summaries.has(conversationId)) {
        continue;
      }

      summaries.set(conversationId, {
        id: conversationId,
        contactName: conversationId,
        lastMessage: message.body ?? '',
        lastMessageAt: message.createdAt.toISOString(),
        unreadCount: 0,
        pendingQuote: null,
        conversationControl: {
          state: BotConversationState.QUALIFYING,
          control: 'ai_control',
          updatedAt: message.createdAt.toISOString(),
          updatedBy: 'system',
        },
      });
    }

    const conversationIds = Array.from(summaries.keys());
    const pendingQuotesByConversationId =
      await this.getActionableQuoteSummariesByConversationIds(conversationIds);
    const controlsByConversationId =
      await this.getConversationControlsByConversationIds(conversationIds);

    return Array.from(summaries.values()).map((summary) => ({
      ...summary,
      pendingQuote: pendingQuotesByConversationId.get(summary.id) ?? null,
      conversationControl:
        controlsByConversationId.get(summary.id) ?? summary.conversationControl,
    }));
  }

  async listConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
    const normalizedConversationId = this.normalizeParticipantPhone(conversationId);
    const messages = await this.prisma.message.findMany({
      orderBy: { createdAt: 'asc' },
      select: messageProjection,
    });

    const history = messages
      .filter((message) => this.getStableConversationId(message) === normalizedConversationId)
      .map((message) => ({
        id: message.id,
        conversationId: normalizedConversationId,
        direction: this.normalizeDirection(message.direction),
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      }));

    if (history.length === 0) {
      throw new NotFoundException(
        `Conversation ${normalizedConversationId} was not found.`,
      );
    }

    return history;
  }

  async getConversationQuoteReview(
    conversationId: string,
  ): Promise<ConversationQuoteReviewDto> {
    const normalizedConversationId = this.normalizeParticipantPhone(conversationId);
    await this.assertConversationExists(normalizedConversationId);

    const draft = await this.findLatestReviewRelevantDraft(normalizedConversationId);

    if (!draft) {
      const brief = await this.prisma.commercialBrief.findUnique({
        where: { conversationId: normalizedConversationId },
        select: {
          status: true,
          customerName: true,
          summary: true,
          projectType: true,
          budget: true,
          urgency: true,
        },
      });
      const hasArchivedDraft = await this.hasArchivedReviewDraft(normalizedConversationId);
      const lifecycleState = this.resolveLifecycleState({
        briefStatus: brief?.status ?? null,
        hasActiveDraft: false,
        activeDraftReviewStatus: null,
        hasArchivedDraft,
      });

      return this.buildRecoverableQuoteReview({
        conversationId: normalizedConversationId,
        lifecycleState,
        brief,
      });
    }

    const estimateSnapshot = await this.prisma.quoteEstimateSnapshot.findFirst({
      where: {
        conversationId: normalizedConversationId,
        quoteDraftId: draft.id,
      },
      orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
      select: {
        complexityScore: true,
        confidencePct: true,
        estimatedMinAmount: true,
        estimatedTargetAmount: true,
        estimatedMaxAmount: true,
        breakdown: true,
        inputPayload: true,
      },
    });
    const ownerAdjustments = this.extractOwnerAdjustments(draft.draftPayload);

    return {
      conversationId: draft.conversationId,
      quoteDraftId: draft.id,
      version: draft.version,
      reviewStatus: draft.reviewStatus,
      lifecycleState: this.resolveLifecycleState({
        briefStatus: draft.commercialBrief.status,
        hasActiveDraft: true,
        activeDraftReviewStatus: draft.reviewStatus,
        hasArchivedDraft: false,
      }),
      recovery: null,
      renderedQuote: draft.renderedQuote,
      draftSummary: this.getDraftSummary(draft.draftPayload),
      ownerFeedbackSummary: draft.ownerFeedbackSummary,
      approvedAt: draft.approvedAt?.toISOString() ?? null,
      deliveredToCustomerAt: draft.deliveredToCustomerAt?.toISOString() ?? null,
      commercialBrief: {
        customerName: draft.commercialBrief.customerName,
        summary: draft.commercialBrief.summary,
        projectType: draft.commercialBrief.projectType,
        budget: draft.commercialBrief.budget,
        urgency: draft.commercialBrief.urgency,
      },
      pdf: {
        available: !!draft.document,
        fileName: draft.document?.fileName ?? null,
        generatedAt: draft.document?.generatedAt.toISOString() ?? null,
        sizeBytes: draft.document?.sizeBytes ?? null,
        version: draft.version,
      },
      pricingRule: {
        id: draft.pricingRule?.id ?? null,
        version: draft.pricingRuleVersion ?? null,
        category: draft.pricingRule?.category ?? null,
        complexity: draft.pricingRule?.complexity ?? null,
        integrationType: draft.pricingRule?.integrationType ?? null,
      },
      complexityScore:
        estimateSnapshot?.complexityScore !== null &&
        estimateSnapshot?.complexityScore !== undefined
          ? Number(estimateSnapshot.complexityScore)
          : null,
      confidence: estimateSnapshot?.confidencePct ?? null,
      ruleVersionUsed: this.extractRuleVersionUsed(estimateSnapshot?.inputPayload ?? null),
      estimatedMinAmount:
        estimateSnapshot?.estimatedMinAmount !== null &&
        estimateSnapshot?.estimatedMinAmount !== undefined
          ? Number(estimateSnapshot.estimatedMinAmount)
          : null,
      estimatedTargetAmount:
        estimateSnapshot?.estimatedTargetAmount !== null &&
        estimateSnapshot?.estimatedTargetAmount !== undefined
          ? Number(estimateSnapshot.estimatedTargetAmount)
          : null,
      estimatedMaxAmount:
        estimateSnapshot?.estimatedMaxAmount !== null &&
        estimateSnapshot?.estimatedMaxAmount !== undefined
          ? Number(estimateSnapshot.estimatedMaxAmount)
          : null,
      pricingBreakdown: this.extractPricingBreakdown(estimateSnapshot?.breakdown ?? null),
      ownerAdjustments,
    };
  }

  async getConversationQuoteReviewPdf(
    conversationId: string,
  ): Promise<ConversationQuoteReviewPdfFile> {
    const normalizedConversationId = this.normalizeParticipantPhone(conversationId);
    await this.assertConversationExists(normalizedConversationId);

    const draft = await this.findLatestReviewRelevantDraft(normalizedConversationId);

    if (!draft) {
      throw new NotFoundException(
        `Conversation ${normalizedConversationId} has no quote review draft.`,
      );
    }

    const pdf = await this.quotePdfService.getOrCreateDraftPdf(draft.id);

    return {
      conversationId: draft.conversationId,
      quoteDraftId: draft.id,
      version: draft.version,
      fileName: pdf.fileName,
      mimeType: pdf.mimeType,
      sizeBytes: pdf.sizeBytes,
      generatedAt: pdf.generatedAt.toISOString(),
      content: Buffer.from(pdf.content),
    };
  }

  async approveConversationQuote(
    conversationId: string,
    dto: ApproveQuoteDto,
    reviewerIdentity: string,
  ): Promise<ConversationQuoteReviewDto> {
    const normalizedConversationId = this.normalizeParticipantPhone(conversationId);
    await this.assertConversationExists(normalizedConversationId);

    await this.ownerReviewService.approveDraftFromCrm({
      action: OwnerReviewAction.APPROVE,
      conversationId: normalizedConversationId,
      version: dto.version,
      reviewerPhone: reviewerIdentity,
    });

    return this.getConversationQuoteReview(normalizedConversationId);
  }

  async requestConversationQuoteChanges(
    conversationId: string,
    dto: RequestQuoteChangesDto,
    reviewerIdentity: string,
  ): Promise<ConversationQuoteReviewDto> {
    const normalizedConversationId = this.normalizeParticipantPhone(conversationId);
    await this.assertConversationExists(normalizedConversationId);

    await this.ownerReviewService.requestChangesFromCrm({
      action: OwnerReviewAction.REVISE,
      conversationId: normalizedConversationId,
      version: dto.version,
      reviewerPhone: reviewerIdentity,
      feedback: dto.feedback.trim(),
    });

    return this.getConversationQuoteReview(normalizedConversationId);
  }

  async applyOwnerAdjustments(
    conversationId: string,
    dto: ApplyOwnerAdjustmentsDto,
    reviewerIdentity: string,
  ): Promise<ConversationQuoteReviewDto> {
    const normalizedConversationId = this.normalizeParticipantPhone(conversationId);
    await this.assertConversationExists(normalizedConversationId);

    const draft = await this.findLatestReviewRelevantDraft(normalizedConversationId);
    if (!draft || draft.version !== dto.version) {
      throw new NotFoundException(
        `Quote draft ${normalizedConversationId} v${dto.version} is not the active review version.`,
      );
    }

    if (!isActionableReviewStatus(draft.reviewStatus)) {
      throw new BadRequestException(
        `Quote draft ${normalizedConversationId} v${dto.version} cannot accept owner adjustments from state ${draft.reviewStatus}.`,
      );
    }

    const latestSnapshot = await this.prisma.quoteEstimateSnapshot.findFirst({
      where: {
        conversationId: normalizedConversationId,
        quoteDraftId: draft.id,
      },
      orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        currency: true,
        effortHours: true,
        complexityScore: true,
        confidencePct: true,
        estimatedMinAmount: true,
        estimatedTargetAmount: true,
        estimatedMaxAmount: true,
        breakdown: true,
        inputPayload: true,
      },
    });

    if (!latestSnapshot) {
      throw new BadRequestException(
        `Quote draft ${normalizedConversationId} v${dto.version} has no estimate snapshot to adjust.`,
      );
    }

    const previousRange = {
      min: Number(latestSnapshot.estimatedMinAmount),
      target: Number(latestSnapshot.estimatedTargetAmount),
      max: Number(latestSnapshot.estimatedMaxAmount),
    };
    const adjustedRange = {
      min: this.roundCurrency(dto.estimatedMinAmount ?? previousRange.min),
      target: this.roundCurrency(dto.estimatedTargetAmount ?? previousRange.target),
      max: this.roundCurrency(dto.estimatedMaxAmount ?? previousRange.max),
    };

    if (adjustedRange.min <= 0 || adjustedRange.target <= 0 || adjustedRange.max <= 0) {
      throw new BadRequestException(
        'estimatedMinAmount, estimatedTargetAmount and estimatedMaxAmount must be greater than zero.',
      );
    }

    if (
      adjustedRange.min > adjustedRange.target ||
      adjustedRange.target > adjustedRange.max
    ) {
      throw new BadRequestException(
        'Manual range is invalid. Expected min <= target <= max.',
      );
    }

    const normalizedAssumptions = this.resolveAssumptionsForAdjustment(
      dto.assumptions,
      latestSnapshot.inputPayload,
    );
    const reason = dto.reason?.trim() || null;
    const rangeChanged =
      adjustedRange.min !== previousRange.min ||
      adjustedRange.target !== previousRange.target ||
      adjustedRange.max !== previousRange.max;
    const assumptionsChanged =
      JSON.stringify(normalizedAssumptions) !==
      JSON.stringify(this.extractAssumptions(latestSnapshot.inputPayload));

    if (!rangeChanged && !assumptionsChanged && !reason) {
      throw new BadRequestException(
        'No adjustment detected. Provide updated range, assumptions or reason.',
      );
    }

    const adjustedAt = new Date();
    const adjustmentAuditEntry: OwnerAdjustmentAuditEntry = {
      adjustedAt: adjustedAt.toISOString(),
      adjustedBy: reviewerIdentity,
      previousRange,
      adjustedRange,
      assumptions: normalizedAssumptions,
      reason,
    };

    const existingOwnerAdjustments = this.extractOwnerAdjustments(draft.draftPayload);
    const ownerAdjustments = [...existingOwnerAdjustments, adjustmentAuditEntry].slice(-25);
    const draftPayloadWithAdjustments = this.mergeDraftPayloadOwnerAdjustments(
      draft.draftPayload,
      ownerAdjustments,
    );
    const existingInputPayload = this.safeJsonObject(latestSnapshot.inputPayload);
    const nextRuleVersionUsed =
      this.extractRuleVersionUsed(latestSnapshot.inputPayload) ?? draft.pricingRuleVersion ?? null;
    const adjustmentMetadata = {
      ...existingInputPayload,
      source: 'crm_owner_adjustment',
      computedAt: adjustedAt.toISOString(),
      ruleVersionUsed: nextRuleVersionUsed,
      assumptions: normalizedAssumptions,
      ownerAdjustments,
    } as Prisma.InputJsonObject;
    const breakdown = this.mergeBreakdownWithOwnerRange(
      latestSnapshot.breakdown,
      adjustedRange,
      reason,
    );

    const latestIteration = await this.prisma.quoteReviewEvent.findFirst({
      where: { quoteDraftId: draft.id },
      orderBy: [{ iteration: 'desc' }, { createdAt: 'desc' }],
      select: { iteration: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.quoteDraft.update({
        where: { id: draft.id },
        data: {
          reviewStatus: 'ready_for_recheck',
          draftPayload: draftPayloadWithAdjustments,
        },
      });

      await tx.quoteEstimateSnapshot.create({
        data: {
          conversationId: normalizedConversationId,
          quoteDraftId: draft.id,
          pricingRuleId: draft.pricingRuleId,
          currency: latestSnapshot.currency,
          effortHours: latestSnapshot.effortHours,
          complexityScore: latestSnapshot.complexityScore,
          confidencePct: latestSnapshot.confidencePct,
          estimatedMinAmount: adjustedRange.min,
          estimatedTargetAmount: adjustedRange.target,
          estimatedMaxAmount: adjustedRange.max,
          breakdown,
          inputPayload: adjustmentMetadata,
        },
      });

      await tx.quoteReviewEvent.create({
        data: {
          quoteDraftId: draft.id,
          conversationId: normalizedConversationId,
          iteration: (latestIteration?.iteration ?? 0) + 1,
          reviewStatus: 'ready_for_recheck',
          feedback: this.buildOwnerAdjustmentFeedback(adjustmentAuditEntry),
          resolvedAt: adjustedAt,
        },
      });
    });

    return this.getConversationQuoteReview(normalizedConversationId);
  }

  async resendQuotePdfToCustomer(conversationId: string): Promise<void> {
    const normalizedConversationId = this.normalizeParticipantPhone(conversationId);
    await this.assertConversationExists(normalizedConversationId);

    const draft = await this.findLatestReviewRelevantDraft(normalizedConversationId);

    if (!draft) {
      throw new NotFoundException(
        `Conversation ${normalizedConversationId} has no quote review draft.`,
      );
    }

    const senderPhoneNumberId =
      this.config.get<string>('KAPSO_PHONE_NUMBER_ID')?.trim() || undefined;

    const pdf = await this.quotePdfService.getOrCreateDraftPdf(draft.id);
    const buffer = Buffer.from(pdf.content as Uint8Array);
    const pdfMessageId = await this.messagingService.sendDocument(
      normalizedConversationId,
      buffer,
      pdf.fileName,
      undefined,
      senderPhoneNumberId,
    );

    await this.prisma.message.create({
      data: {
        externalMessageId: pdfMessageId,
        direction: 'outbound',
        fromPhone: senderPhoneNumberId ?? 'crm',
        toPhone: normalizedConversationId,
        body: null,
        channel: 'whatsapp',
        rawPayload: {
          externalMessageId: pdfMessageId,
          direction: 'outbound',
          fromPhone: senderPhoneNumberId ?? 'crm',
          toPhone: normalizedConversationId,
          source: 'crm-resend-pdf',
          quoteDraftId: draft.id,
          version: draft.version,
          fileName: pdf.fileName,
        },
      },
    });

    this.logger.log({
      event: 'crm_resend_pdf',
      conversationId: normalizedConversationId,
      quoteDraftId: draft.id,
      version: draft.version,
    });
  }

  async forceGenerateQuoteDraft(conversationId: string): Promise<ConversationQuoteReviewDto> {
    const normalizedConversationId = this.normalizeParticipantPhone(conversationId);
    await this.assertConversationExists(normalizedConversationId);

    // Process the conversation synchronously to generate the draft
    const result = await this.aiSalesOrchestrator.processQualifiedConversation(normalizedConversationId);

    if (result.processingStage !== 'draft_ready_for_review') {
      throw new Error(`Could not generate quote draft: ${result.processingStage}. Missing fields: ${result.missingFields?.join(', ') ?? 'none'}`);
    }

    return this.getConversationQuoteReview(normalizedConversationId);
  }

  async sendMessage(
    conversationId: string,
    body: string,
  ): Promise<ConversationMessage> {
    const normalizedConversationId = this.normalizeParticipantPhone(conversationId);
    const normalizedBody = body.trim();
    const { senderPhoneNumberId, source } = await this.resolveSenderPhoneNumberId(
      normalizedConversationId,
    );
    this.logger.log({
      event: 'conversation_send_message_attempt',
      conversationId: normalizedConversationId,
      senderPhoneNumberId: senderPhoneNumberId ?? null,
      senderSource: source,
      bodyPreview: normalizedBody.slice(0, 120),
    });
    const externalMessageId = await this.messagingService.sendText(
      normalizedConversationId,
      normalizedBody,
      senderPhoneNumberId,
    );
    const fromPhone =
      senderPhoneNumberId ?? this.config.get<string>('KAPSO_PHONE_NUMBER_ID')?.trim();

    const created = await this.prisma.message.create({
      data: {
        externalMessageId,
        direction: 'outbound',
        fromPhone: fromPhone && fromPhone.length > 0 ? fromPhone : 'crm',
        toPhone: normalizedConversationId,
        body: normalizedBody,
        channel: 'whatsapp',
        rawPayload: {
          externalMessageId,
          direction: 'outbound',
          fromPhone: fromPhone && fromPhone.length > 0 ? fromPhone : 'crm',
          toPhone: normalizedConversationId,
          body: normalizedBody,
          source: 'crm-manual-reply',
        },
      },
      select: {
        id: true,
        direction: true,
        body: true,
        createdAt: true,
      },
    });

    return {
      id: created.id,
      conversationId: normalizedConversationId,
      direction: this.normalizeDirection(created.direction),
      body: created.body,
      createdAt: created.createdAt.toISOString(),
    };
  }

  private async updateConversationControl(
    conversationId: string,
    control: ConversationControlMode,
    actorIdentity: string,
  ): Promise<ConversationControlUpdate> {
    const normalizedConversationId = this.normalizeParticipantPhone(conversationId);
    await this.assertConversationExists(normalizedConversationId);

    const existingState = await this.loadConversationState(normalizedConversationId);
    const now = new Date();
    const updatedAt = now.toISOString();
    const updatedBy = actorIdentity.trim() || 'crm';

    if (control === 'pending_resume' && existingState?.state !== BotConversationState.HUMAN_HANDOFF) {
      this.logger.warn({
        event: 'conversation_control_resume_failed',
        conversationId: normalizedConversationId,
        actor: updatedBy,
        reason: 'resume_requires_human_handoff_state',
        currentState: existingState?.state ?? null,
      });
      throw new BadRequestException(
        'Conversation is not in human handoff state. Transfer control to human first.',
      );
    }

    const existingMetadata = this.safeJsonObject(existingState?.metadata);
    const existingRequestedAt =
      typeof existingMetadata.requestedAt === 'string' ? existingMetadata.requestedAt : null;
    const shouldStayOnHandoff =
      control === 'human_control' || control === 'pending_resume';

    const nextState =
      shouldStayOnHandoff
        ? BotConversationState.HUMAN_HANDOFF
        : BotConversationState.QUALIFYING;
    const nextMetadata: Prisma.InputJsonObject = {
      ...existingMetadata,
      conversationControl: {
        mode: control,
        updatedAt,
        actor: updatedBy,
      },
      ...(shouldStayOnHandoff
        ? {
            requestedAt: existingRequestedAt ?? updatedAt,
            ownerNotified: true,
          }
        : {}),
    };

    await this.botConversationRepository.saveState(
      {
        conversationId: normalizedConversationId,
        state: nextState,
        metadata: nextMetadata,
        offFlowCount: 0,
        lastInboundMessageId: existingState?.lastInboundMessageId ?? null,
        lastTransitionAt: now,
      },
      this.botConversationTtlSeconds,
    );

    const eventName =
      control === 'human_control'
        ? 'conversation_control_transferred'
        : control === 'pending_resume'
          ? 'conversation_control_resumed_ai'
          : 'conversation_control_updated';
    this.logger.log({
      event: eventName,
      conversationId: normalizedConversationId,
      state: nextState,
      control,
      actor: updatedBy,
    });

    return {
      conversationId: normalizedConversationId,
      state: nextState,
      control,
      updatedAt,
      updatedBy,
    };
  }

  private async loadConversationState(
    conversationId: string,
  ): Promise<BotConversationSnapshot | null> {
    const cached = await this.botConversationRepository.loadState(conversationId);
    if (cached) {
      return cached;
    }

    return this.botConversationRepository.rebuildState(conversationId);
  }

  private getStableConversationId(message: MessageIdentityRow): string {
    const participantPhone =
      this.normalizeDirection(message.direction) === 'outbound'
        ? message.toPhone
        : message.fromPhone;

    return this.normalizeParticipantPhone(participantPhone);
  }

  private async assertConversationExists(conversationId: string): Promise<void> {
    const existingMessage = await this.prisma.message.findFirst({
      where: {
        OR: [{ fromPhone: conversationId }, { toPhone: conversationId }],
      },
      select: { id: true, direction: true, fromPhone: true, toPhone: true },
    });

    if (!existingMessage || this.getStableConversationId(existingMessage) !== conversationId) {
      throw new NotFoundException(`Conversation ${conversationId} was not found.`);
    }
  }

  private async getActionableQuoteSummariesByConversationIds(
    conversationIds: string[],
  ): Promise<Map<string, PendingQuoteSummaryDto>> {
    if (conversationIds.length === 0) {
      return new Map();
    }

    const drafts = await this.prisma.quoteDraft.findMany({
      where: {
        conversationId: { in: conversationIds },
        reviewStatus: { in: [...reviewRelevantStatuses] },
      },
      orderBy: [{ conversationId: 'asc' }, { version: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        conversationId: true,
        version: true,
        reviewStatus: true,
        draftPayload: true,
      },
    });

    const summaries = new Map<string, PendingQuoteSummaryDto>();

    for (const draft of drafts) {
      if (summaries.has(draft.conversationId)) {
        continue;
      }

      if (this.isDraftArchived(draft.draftPayload)) {
        continue;
      }

      if (!isActionableReviewStatus(draft.reviewStatus)) {
        continue;
      }

      summaries.set(draft.conversationId, {
        conversationId: draft.conversationId,
        quoteDraftId: draft.id,
        version: draft.version,
        reviewStatus: draft.reviewStatus,
      });
    }

    return summaries;
  }

  private async getConversationControlsByConversationIds(
    conversationIds: string[],
  ): Promise<Map<string, ConversationSummary['conversationControl']>> {
    if (conversationIds.length === 0) {
      return new Map();
    }

    const snapshots = await Promise.all(
      conversationIds.map(async (conversationId) => ({
        conversationId,
        snapshot: await this.loadConversationState(conversationId),
      })),
    );
    const controls = new Map<string, ConversationSummary['conversationControl']>();

    for (const { conversationId, snapshot } of snapshots) {
      if (!snapshot) {
        continue;
      }

      const metadata = this.safeJsonObject(snapshot.metadata);
      const controlMetadata = this.safeJsonObject(metadata.conversationControl);
      const mode = controlMetadata.mode;
      const control: ConversationControlMode =
        mode === 'human_control' || mode === 'pending_resume' || mode === 'ai_control'
          ? mode
          : snapshot.state === BotConversationState.HUMAN_HANDOFF
            ? 'human_control'
            : 'ai_control';

      controls.set(conversationId, {
        state: snapshot.state,
        control,
        updatedAt:
          typeof controlMetadata.updatedAt === 'string'
            ? controlMetadata.updatedAt
            : snapshot.lastTransitionAt.toISOString(),
        updatedBy:
          typeof controlMetadata.actor === 'string' ? controlMetadata.actor : 'system',
      });
    }

    return controls;
  }

  private async findLatestReviewRelevantDraft(conversationId: string) {
    const drafts = await this.prisma.quoteDraft.findMany({
      where: {
        conversationId,
        reviewStatus: { in: [...reviewRelevantStatuses] },
      },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
      take: 25,
      include: {
        commercialBrief: {
          select: {
            status: true,
            customerName: true,
            summary: true,
            projectType: true,
            budget: true,
            urgency: true,
          },
        },
        document: {
          select: {
            fileName: true,
            sizeBytes: true,
            generatedAt: true,
          },
        },
        pricingRule: {
          select: {
            id: true,
            category: true,
            complexity: true,
            integrationType: true,
          },
        },
      },
    });

    return drafts.find((draft) => !this.isDraftArchived(draft.draftPayload)) ?? null;
  }

  private async hasArchivedReviewDraft(conversationId: string): Promise<boolean> {
    const drafts = await this.prisma.quoteDraft.findMany({
      where: {
        conversationId,
        reviewStatus: { in: [...reviewRelevantStatuses] },
      },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
      take: 25,
      select: {
        id: true,
        draftPayload: true,
      },
    });

    return drafts.some((draft) => this.isDraftArchived(draft.draftPayload));
  }

  private isDraftArchived(payload: Prisma.JsonValue | null | undefined): boolean {
    const payloadObj = this.safeJsonObject(payload);
    const lifecycle = this.safeJsonObject(payloadObj.lifecycle);
    return typeof lifecycle.archivedAt === 'string' && lifecycle.archivedAt.trim().length > 0;
  }

  private resolveLifecycleState(input: {
    briefStatus: string | null;
    hasActiveDraft: boolean;
    activeDraftReviewStatus: QuoteReviewStatus | null;
    hasArchivedDraft: boolean;
  }): QuoteLifecycleState {
    if (input.hasActiveDraft) {
      if (input.activeDraftReviewStatus === 'delivered_to_customer') {
        return 'quote_sent';
      }
      return 'quote_draft_ready';
    }

    if (input.briefStatus === 'collecting') {
      return 'brief_collecting';
    }

    if (input.briefStatus === 'ready_for_quote') {
      return 'brief_complete';
    }

    if (input.hasArchivedDraft) {
      return 'quote_archived';
    }

    return 'idle';
  }

  private buildRecoverableQuoteReview(input: {
    conversationId: string;
    lifecycleState: QuoteLifecycleState;
    brief: {
      customerName: string | null;
      summary: string | null;
      projectType: string | null;
      budget: string | null;
      urgency: string | null;
    } | null;
  }): ConversationQuoteReviewDto {
    const recoveryByState: Record<
      QuoteLifecycleState,
      { action: string; message: string } | null
    > = {
      idle: {
        action: 'restart_brief',
        message:
          'No existe un brief comercial activo para esta conversación. Inicia la captura del brief desde el chat.',
      },
      brief_collecting: {
        action: 'restart_brief',
        message:
          'El brief todavía está en recolección. Completa los campos clave antes de generar un draft.',
      },
      brief_complete: {
        action: 'create_draft',
        message:
          'El brief está completo pero no hay draft activo. Genera una nueva cotización desde CRM.',
      },
      quote_draft_ready: {
        action: 'create_draft',
        message:
          'No se encontró un draft activo para revisión aunque el flujo indica estado de draft. Regenera la cotización.',
      },
      quote_sent: {
        action: 'wait_for_review',
        message:
          'La última cotización ya fue enviada al cliente y no hay un draft editable activo en este momento.',
      },
      quote_archived: {
        action: 'create_draft',
        message:
          'Se archivó una cotización anterior por cambio de intención. Genera un nuevo draft para continuar.',
      },
    };

    const brief = input.brief ?? {
      customerName: null,
      summary: null,
      projectType: null,
      budget: null,
      urgency: null,
    };
    const recovery = recoveryByState[input.lifecycleState];

    return {
      conversationId: input.conversationId,
      quoteDraftId: null,
      version: null,
      reviewStatus: null,
      lifecycleState: input.lifecycleState,
      recovery: recovery ? { ...recovery } : null,
      renderedQuote: null,
      draftSummary: recovery?.message ?? null,
      ownerFeedbackSummary: null,
      approvedAt: null,
      deliveredToCustomerAt: null,
      commercialBrief: {
        customerName: brief.customerName,
        summary: brief.summary,
        projectType: brief.projectType,
        budget: brief.budget,
        urgency: brief.urgency,
      },
      pdf: {
        available: false,
        fileName: null,
        generatedAt: null,
        sizeBytes: null,
        version: 0,
      },
      pricingRule: {
        id: null,
        version: null,
        category: null,
        complexity: null,
        integrationType: null,
      },
      complexityScore: null,
      confidence: null,
      ruleVersionUsed: null,
      estimatedMinAmount: null,
      estimatedTargetAmount: null,
      estimatedMaxAmount: null,
      pricingBreakdown: null,
      ownerAdjustments: [],
    };
  }

  private getDraftSummary(draftPayload: unknown): string | null {
    if (!isRecord(draftPayload)) {
      return null;
    }

    const summary =
      typeof draftPayload.summary === 'string' ? draftPayload.summary.trim() : '';

    return summary || null;
  }

  private extractPricingBreakdown(
    breakdown: Prisma.JsonValue | null,
  ): Record<string, unknown> | null {
    if (!isRecord(breakdown)) {
      return null;
    }

    return breakdown;
  }

  private extractRuleVersionUsed(inputPayload: Prisma.JsonValue | null): number | null {
    if (!isRecord(inputPayload)) {
      return null;
    }

    const raw = inputPayload.ruleVersionUsed;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }

    if (typeof raw === 'string') {
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private extractAssumptions(inputPayload: Prisma.JsonValue | null): string[] {
    if (!isRecord(inputPayload) || !Array.isArray(inputPayload.assumptions)) {
      return [];
    }

    return inputPayload.assumptions
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private resolveAssumptionsForAdjustment(
    assumptions: string[] | undefined,
    snapshotInputPayload: Prisma.JsonValue | null,
  ): string[] {
    if (!assumptions) {
      return this.extractAssumptions(snapshotInputPayload);
    }

    return Array.from(
      new Set(
        assumptions
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      ),
    );
  }

  private extractOwnerAdjustments(draftPayload: unknown): OwnerAdjustmentAuditEntry[] {
    if (!isRecord(draftPayload) || !Array.isArray(draftPayload.ownerAdjustments)) {
      return [];
    }

    return draftPayload.ownerAdjustments
      .map((item) => this.parseOwnerAdjustmentEntry(item))
      .filter((entry): entry is OwnerAdjustmentAuditEntry => !!entry);
  }

  private parseOwnerAdjustmentEntry(value: unknown): OwnerAdjustmentAuditEntry | null {
    if (!isRecord(value)) {
      return null;
    }

    const previousRange = this.parseRangeRecord(value.previousRange);
    const adjustedRange = this.parseRangeRecord(value.adjustedRange);
    if (!previousRange || !adjustedRange) {
      return null;
    }

    const adjustedAt =
      typeof value.adjustedAt === 'string' && value.adjustedAt.trim().length > 0
        ? value.adjustedAt
        : null;
    const adjustedBy =
      typeof value.adjustedBy === 'string' && value.adjustedBy.trim().length > 0
        ? value.adjustedBy
        : null;
    if (!adjustedAt || !adjustedBy) {
      return null;
    }

    const assumptions = Array.isArray(value.assumptions)
      ? value.assumptions
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];
    const reason = typeof value.reason === 'string' && value.reason.trim() ? value.reason : null;

    return {
      adjustedAt,
      adjustedBy,
      previousRange,
      adjustedRange,
      assumptions,
      reason,
    };
  }

  private parseRangeRecord(value: unknown):
    | {
        min: number;
        target: number;
        max: number;
      }
    | null {
    if (!isRecord(value)) {
      return null;
    }

    const min = this.parseNumber(value.min);
    const target = this.parseNumber(value.target);
    const max = this.parseNumber(value.max);
    if (min === null || target === null || max === null) {
      return null;
    }

    return { min, target, max };
  }

  private parseNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return this.roundCurrency(value);
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? this.roundCurrency(parsed) : null;
    }

    return null;
  }

  private mergeDraftPayloadOwnerAdjustments(
    draftPayload: unknown,
    ownerAdjustments: OwnerAdjustmentAuditEntry[],
  ): Prisma.InputJsonObject {
    const payload = this.safeJsonObject(draftPayload);
    return {
      ...payload,
      ownerAdjustments,
    };
  }

  private safeJsonObject(value: unknown): Prisma.InputJsonObject {
    if (!isRecord(value)) {
      return {};
    }

    return value as Prisma.InputJsonObject;
  }

  private mergeBreakdownWithOwnerRange(
    breakdown: Prisma.JsonValue | null,
    adjustedRange: { min: number; target: number; max: number },
    reason: string | null,
  ): Prisma.InputJsonValue {
    const base = this.safeJsonObject(breakdown);
    return {
      ...base,
      ownerAdjustedRange: adjustedRange,
      ownerAdjustmentReason: reason,
    } as Prisma.InputJsonObject;
  }

  private buildOwnerAdjustmentFeedback(adjustment: OwnerAdjustmentAuditEntry): string {
    const assumptionsText =
      adjustment.assumptions.length > 0
        ? ` Assumptions: ${adjustment.assumptions.join('; ')}.`
        : '';
    const reasonText = adjustment.reason ? ` Reason: ${adjustment.reason}.` : '';

    return `CRM owner adjustment by ${adjustment.adjustedBy}. Range ${adjustment.previousRange.min}-${adjustment.previousRange.target}-${adjustment.previousRange.max} -> ${adjustment.adjustedRange.min}-${adjustment.adjustedRange.target}-${adjustment.adjustedRange.max}.${assumptionsText}${reasonText}`.trim();
  }

  private roundCurrency(value: number): number {
    return Number(value.toFixed(2));
  }

  private async resolveSenderPhoneNumberId(
    normalizedConversationId: string,
  ): Promise<{ senderPhoneNumberId?: string; source: 'history' | 'config' | 'missing' }> {
    const messages = await this.prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      select: messageProjectionWithRawPayload,
    });

    for (const message of messages) {
      if (this.getStableConversationId(message) !== normalizedConversationId) {
        continue;
      }

      const senderPhoneNumberId = this.extractSenderPhoneNumberId(message.rawPayload);
      if (senderPhoneNumberId) {
        return { senderPhoneNumberId, source: 'history' };
      }
    }

    const fallbackPhoneNumberId = this.config.get<string>('KAPSO_PHONE_NUMBER_ID')?.trim();
    if (fallbackPhoneNumberId) {
      return { senderPhoneNumberId: fallbackPhoneNumberId, source: 'config' };
    }

    return { source: 'missing' };
  }

  private extractSenderPhoneNumberId(rawPayload: unknown): string | undefined {
    if (!isRecord(rawPayload)) {
      return undefined;
    }

    const directPhoneNumberId =
      typeof rawPayload.phone_number_id === 'string' ? rawPayload.phone_number_id.trim() : '';
    if (directPhoneNumberId) {
      return directPhoneNumberId;
    }

    const metadata = isRecord(rawPayload.metadata) ? rawPayload.metadata : undefined;
    const metadataPhoneNumberId =
      metadata && typeof metadata.phone_number_id === 'string'
        ? metadata.phone_number_id.trim()
        : '';
    if (metadataPhoneNumberId) {
      return metadataPhoneNumberId;
    }

    if (Array.isArray(rawPayload.entry)) {
      for (const entry of rawPayload.entry) {
        if (!isRecord(entry) || !Array.isArray(entry.changes)) {
          continue;
        }

        for (const change of entry.changes) {
          const value = isRecord(change) && isRecord(change.value) ? change.value : undefined;
          const nestedMetadata =
            value && isRecord(value.metadata) ? value.metadata : undefined;
          const nestedPhoneNumberId =
            nestedMetadata && typeof nestedMetadata.phone_number_id === 'string'
              ? nestedMetadata.phone_number_id.trim()
              : '';

          if (nestedPhoneNumberId) {
            return nestedPhoneNumberId;
          }
        }
      }
    }

    if (Array.isArray(rawPayload.data)) {
      for (const item of rawPayload.data) {
        if (!isRecord(item)) {
          continue;
        }

        const itemPhoneNumberId =
          typeof item.phone_number_id === 'string' ? item.phone_number_id.trim() : '';
        if (itemPhoneNumberId) {
          return itemPhoneNumberId;
        }

        const itemConversation = isRecord(item.conversation) ? item.conversation : undefined;
        const itemConversationPhoneNumberId =
          itemConversation && typeof itemConversation.phone_number_id === 'string'
            ? itemConversation.phone_number_id.trim()
            : '';
        if (itemConversationPhoneNumberId) {
          return itemConversationPhoneNumberId;
        }
      }
    }

    const conversation = isRecord(rawPayload.conversation) ? rawPayload.conversation : undefined;
    const conversationPhoneNumberId =
      conversation && typeof conversation.phone_number_id === 'string'
        ? conversation.phone_number_id.trim()
        : '';
    if (conversationPhoneNumberId) {
      return conversationPhoneNumberId;
    }

    return undefined;
  }

  private normalizeDirection(direction: string): ConversationDirection {
    if (direction === 'inbound' || direction === 'outbound') {
      return direction;
    }

    throw new Error(`Unsupported conversation direction: ${direction}`);
  }

  private normalizeParticipantPhone(phone: string): string {
    return phone.trim();
  }
}
