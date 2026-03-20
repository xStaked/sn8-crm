import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiSalesService } from './ai-sales.service';
import {
  AI_SALES_PROCESS_QUALIFIED_JOB,
  AI_SALES_QUEUE,
  AiSalesStateDto,
  ProcessQualifiedConversationJob,
} from './dto/ai-sales-state.dto';

const REQUIRED_BRIEF_FIELDS = [
  'projectType',
  'businessProblem',
  'desiredScope',
  'budget',
  'urgency',
  'constraints',
] as const;

@Injectable()
export class AiSalesOrchestrator {
  private readonly logger = new Logger(AiSalesOrchestrator.name);

  constructor(
    @InjectQueue(AI_SALES_QUEUE) private readonly aiSalesQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly aiSalesService: AiSalesService,
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
        jobId: `qualified:${normalizedConversationId}`,
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
      customerName: extractedBrief.customerName ?? currentBrief?.customerName ?? null,
      projectType: extractedBrief.projectType ?? currentBrief?.projectType ?? null,
      businessProblem:
        extractedBrief.businessProblem ?? currentBrief?.businessProblem ?? null,
      desiredScope: extractedBrief.desiredScope ?? currentBrief?.desiredScope ?? null,
      budget: extractedBrief.budget ?? currentBrief?.budget ?? null,
      urgency: extractedBrief.urgency ?? currentBrief?.urgency ?? null,
      constraints: extractedBrief.constraints ?? currentBrief?.constraints ?? null,
      summary: extractedBrief.summary ?? currentBrief?.summary ?? null,
    };
    const missingFields = REQUIRED_BRIEF_FIELDS.filter(
      (field) => !mergedBrief[field]?.trim(),
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
}
