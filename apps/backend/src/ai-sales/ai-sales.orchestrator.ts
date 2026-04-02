import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagingService } from '../messaging/messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiSalesService } from './ai-sales.service';
import {
  AI_SALES_PROCESS_QUALIFIED_JOB,
  AI_SALES_QUEUE,
  AiSalesStateDto,
  ProcessQualifiedConversationJob,
} from './dto/ai-sales-state.dto';
import { OwnerReviewService } from './owner-review.service';

// Core fields that are truly required to understand the project
const CORE_BRIEF_FIELDS = [
  'projectType',
  'businessProblem',
  'desiredScope',
] as const;

// Optional fields - we collect them if provided but don't block the quote
const OPTIONAL_BRIEF_FIELDS = [
  'budget',
  'urgency',
  'constraints',
] as const;

const DRAFT_PENDING_REVIEW_STATUS =
  'Gracias por la informacion. Ya estamos consolidando una propuesta preliminar y en este momento queda en revision interna con el socio antes de compartir cualquier cotizacion final.';

@Injectable()
export class AiSalesOrchestrator {
  private readonly logger = new Logger(AiSalesOrchestrator.name);

  constructor(
    @InjectQueue(AI_SALES_QUEUE) private readonly aiSalesQueue: Queue,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversationsService: ConversationsService,
    private readonly messagingService: MessagingService,
    private readonly config: ConfigService,
    private readonly aiSalesService: AiSalesService,
    private readonly ownerReviewService: OwnerReviewService,
  ) {}

  async enqueueQualifiedConversation(
    conversationId: string,
    triggeredBy: ProcessQualifiedConversationJob['triggeredBy'] = 'phase-2-handoff',
  ): Promise<ProcessQualifiedConversationJob> {
    const normalizedConversationId = conversationId.trim();
    const job = {
      conversationId: normalizedConversationId,
      triggeredBy,
      requestedAt: new Date().toISOString(),
    } satisfies ProcessQualifiedConversationJob;

    await this.aiSalesQueue.add(
      AI_SALES_PROCESS_QUALIFIED_JOB,
      job,
      {
        jobId: `qualified_${normalizedConversationId}`,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    this.logger.log({
      event: 'ai_sales_qualification_enqueued',
      conversationId: normalizedConversationId,
      triggeredBy,
    });

    return job;
  }

  /**
   * Force immediate generation of a quote draft for a conversation.
   * This bypasses the queue and runs synchronously - useful for manual regeneration from CRM.
   */
  async forceGenerateQuoteDraft(conversationId: string): Promise<AiSalesStateDto> {
    const normalizedConversationId = conversationId.trim();
    
    this.logger.log({
      event: 'ai_sales_force_generate_draft_started',
      conversationId: normalizedConversationId,
    });

    const result = await this.processQualifiedConversation(normalizedConversationId);

    this.logger.log({
      event: 'ai_sales_force_generate_draft_completed',
      conversationId: normalizedConversationId,
      processingStage: result.processingStage,
      quoteDraftId: result.quoteDraftId ?? null,
    });

    return result;
  }

  async processQualifiedConversation(
    conversationId: string,
  ): Promise<AiSalesStateDto> {
    const normalizedConversationId = conversationId.trim();
    const messages =
      await this.conversationsService.listConversationMessages(normalizedConversationId);
    const transcript = messages
      .map(
        (message) =>
          `[${message.createdAt}] ${message.direction === 'inbound' ? 'Cliente' : 'SN8'}: ${
            message.body?.trim() || '(sin texto)'
          }`,
      )
      .join('\n');

    const currentBrief = await this.prisma.commercialBrief.findUnique({
      where: { conversationId: normalizedConversationId },
      include: {
        quoteDrafts: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    const extractedBrief = await this.aiSalesService.extractCommercialBrief(
      normalizedConversationId,
      transcript,
      currentBrief ?? undefined,
    );
    const mergedBrief = {
      customerName: this.pickMeaningfulValue(
        extractedBrief.customerName,
        currentBrief?.customerName,
      ),
      projectType: this.pickMeaningfulValue(
        extractedBrief.projectType,
        currentBrief?.projectType,
      ),
      businessProblem: this.pickMeaningfulValue(
        extractedBrief.businessProblem,
        currentBrief?.businessProblem,
      ),
      desiredScope: this.pickMeaningfulValue(
        extractedBrief.desiredScope,
        currentBrief?.desiredScope,
      ),
      budget: this.mergeBudgetValue(extractedBrief.budget, currentBrief?.budget),
      urgency: this.pickMeaningfulValue(extractedBrief.urgency, currentBrief?.urgency),
      constraints: this.pickMeaningfulValue(
        extractedBrief.constraints,
        currentBrief?.constraints,
      ),
      summary: this.pickMeaningfulValue(extractedBrief.summary, currentBrief?.summary),
    };
    // Only core fields are required to proceed with a quote
    // Optional fields are nice to have but not blocking
    const missingFields = CORE_BRIEF_FIELDS.filter(
      (field) => !this.hasMeaningfulBriefValue(mergedBrief[field]),
    );

    const brief = await this.prisma.commercialBrief.upsert({
      where: { conversationId: normalizedConversationId },
      create: {
        conversationId: normalizedConversationId,
        status: missingFields.length > 0 ? 'collecting' : 'quote_in_review',
        ...mergedBrief,
        sourceTranscript: messages,
      },
      update: {
        status: missingFields.length > 0 ? 'collecting' : 'quote_in_review',
        ...mergedBrief,
        sourceTranscript: messages,
      },
    });

    if (missingFields.length > 0) {
      this.logger.log({
        event: 'ai_sales_brief_needs_discovery',
        conversationId: normalizedConversationId,
        missingFields,
      });

      return {
        conversationId: normalizedConversationId,
        briefId: brief.id,
        briefStatus: brief.status,
        processingStage: 'needs_discovery',
        missingFields,
      };
    }

    const quoteDraft = await this.aiSalesService.createQuoteDraftFromTranscript({
      conversationId: normalizedConversationId,
      transcript,
      commercialBriefId: brief.id,
    });

    this.logger.log({
      event: 'ai_sales_quote_draft_prepared',
      conversationId: normalizedConversationId,
      quoteDraftId: quoteDraft.id,
      version: quoteDraft.version,
    });

    await this.ownerReviewService.requestOwnerReview(quoteDraft.id);
    await this.sendPendingReviewStatus(normalizedConversationId);

    return {
      conversationId: normalizedConversationId,
      briefId: brief.id,
      briefStatus: brief.status,
      quoteDraftId: quoteDraft.id,
      quoteDraftVersion: quoteDraft.version,
      quoteReviewStatus: quoteDraft.reviewStatus,
      processingStage: 'draft_ready_for_review',
      missingFields: [],
    };
  }

  private async sendPendingReviewStatus(conversationId: string): Promise<void> {
    const senderPhoneNumberId =
      this.config.get<string>('KAPSO_PHONE_NUMBER_ID')?.trim() || undefined;
    const externalMessageId = await this.messagingService.sendText(
      conversationId,
      DRAFT_PENDING_REVIEW_STATUS,
      senderPhoneNumberId,
    );

    await this.prisma.message.create({
      data: {
        externalMessageId,
        direction: 'outbound',
        fromPhone: senderPhoneNumberId ?? 'ai-sales',
        toPhone: conversationId,
        body: DRAFT_PENDING_REVIEW_STATUS,
        channel: 'whatsapp',
        rawPayload: {
          externalMessageId,
          direction: 'outbound',
          fromPhone: senderPhoneNumberId ?? 'ai-sales',
          toPhone: conversationId,
          body: DRAFT_PENDING_REVIEW_STATUS,
          source: 'ai-sales-pending-review',
        },
      },
    });
  }

  private pickMeaningfulValue(
    primary: string | null | undefined,
    fallback: string | null | undefined,
  ): string | null {
    const primaryValue = this.sanitizeBriefValue(primary);
    if (primaryValue) {
      return primaryValue;
    }

    return this.sanitizeBriefValue(fallback);
  }

  private sanitizeBriefValue(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    if (this.looksLikeMissingPlaceholder(normalized)) {
      return null;
    }

    return normalized;
  }

  private normalizeBudgetValue(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    // Client explicitly says they don't have a budget or want us to propose
    if (/(no tengo presupuesto|no sé|no se|dime el precio|dime cuanto|cual es el precio|cuanto cuesta|a definir|por definir|me dices tu|tu me dices)/i.test(normalized)) {
      return 'a definir con SN8';
    }

    if (/(no importa|abierto|flexible|sin tope|lo vemos)/i.test(normalized)) {
      return 'presupuesto abierto';
    }

    return this.looksLikeMissingPlaceholder(normalized) ? null : normalized;
  }

  private mergeBudgetValue(
    primary: string | null | undefined,
    fallback: string | null | undefined,
  ): string | null {
    return this.normalizeBudgetValue(primary) ?? this.normalizeBudgetValue(fallback);
  }

  private hasMeaningfulBriefValue(value: string | null | undefined): boolean {
    return this.sanitizeBriefValue(value) !== null;
  }

  private looksLikeMissingPlaceholder(value: string): boolean {
    return /(falta|faltan|missing|pendiente|por definir|por confirmar|sin definir|no especificado|no proporcionado|desconocido|informacion adicional|información adicional|se requiere|hace falta)/i.test(
      value,
    );
  }
}
