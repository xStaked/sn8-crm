import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, QuoteDraft, QuoteReviewEvent } from '@prisma/client';
import type { Queue } from 'bullmq';
import { validateSync } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
import { AiSalesService } from './ai-sales.service';
import {
  AI_SALES_PROCESS_OWNER_REVISION_JOB,
  AI_SALES_QUEUE,
  ProcessOwnerRevisionJob,
} from './dto/ai-sales-state.dto';
import {
  OwnerReviewAction,
  OwnerReviewCommandDto,
} from './dto/owner-review-command.dto';

type ReviewCommandSource = {
  body: string;
  fromPhone: string;
  messageId?: string;
};

type ReviewActionSource = 'whatsapp' | 'crm';

export type ApprovedCustomerDeliveryPayload = {
  conversationId: string;
  quoteDraftId: string;
  version: number;
  body: string;
};

type ReviewContext = QuoteDraft & {
  commercialBrief: {
    id: string;
    conversationId: string;
    customerName: string | null;
    summary: string | null;
  };
  reviewEvents: Array<Pick<QuoteReviewEvent, 'id' | 'iteration'>>;
};

const OWNER_COMMAND_PREFIX = 'SN8';

@Injectable()
export class OwnerReviewService {
  private readonly logger = new Logger(OwnerReviewService.name);

  constructor(
    @InjectQueue(AI_SALES_QUEUE) private readonly aiSalesQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly messagingService: MessagingService,
    private readonly config: ConfigService,
    private readonly aiSalesService: AiSalesService,
  ) {}

  async requestOwnerReview(quoteDraftId: string): Promise<void> {
    const draft = await this.prisma.quoteDraft.findUnique({
      where: { id: quoteDraftId },
      include: {
        commercialBrief: {
          select: {
            id: true,
            conversationId: true,
            customerName: true,
            summary: true,
          },
        },
      },
    });

    if (!draft) {
      throw new NotFoundException(`Quote draft ${quoteDraftId} was not found.`);
    }

    const ownerPhone = this.getOwnerPhone();
    if (!ownerPhone) {
      this.logger.warn({
        event: 'owner_review_whatsapp_notification_skipped',
        quoteDraftId: draft.id,
        conversationId: draft.conversationId,
        version: draft.version,
        reviewStatus: draft.reviewStatus,
        reason: 'missing_ai_sales_owner_phone',
        message:
          'Quote draft remains pending owner review in CRM; legacy WhatsApp notification was skipped because AI_SALES_OWNER_PHONE is not configured.',
      });
      return;
    }

    const senderPhoneNumberId =
      this.config.get<string>('KAPSO_PHONE_NUMBER_ID')?.trim() || undefined;
    const body = this.buildOwnerReviewMessage(draft);
    const externalMessageId = await this.messagingService.sendText(
      ownerPhone,
      body,
      senderPhoneNumberId,
    );

    await this.prisma.message.create({
      data: {
        externalMessageId,
        direction: 'outbound',
        fromPhone: senderPhoneNumberId ?? 'ai-sales-owner-review',
        toPhone: ownerPhone,
        body,
        channel: 'whatsapp',
        rawPayload: {
          externalMessageId,
          direction: 'outbound',
          fromPhone: senderPhoneNumberId ?? 'ai-sales-owner-review',
          toPhone: ownerPhone,
          body,
          source: 'ai-sales-owner-review',
          conversationId: draft.conversationId,
          quoteDraftId: draft.id,
          version: draft.version,
        },
      },
    });
  }

  parseOwnerCommand(body: string, reviewerPhone?: string): OwnerReviewCommandDto | null {
    const normalizedBody = body.trim().replace(/\s+/g, ' ');
    if (!normalizedBody.toUpperCase().startsWith(`${OWNER_COMMAND_PREFIX} `)) {
      return null;
    }

    const reviseMatch = normalizedBody.match(
      /^SN8\s+REVISE\s+(\S+)\s+v(\d+)\s+(.+)$/i,
    );
    if (reviseMatch) {
      return this.validateCommand({
        action: OwnerReviewAction.REVISE,
        conversationId: reviseMatch[1],
        version: Number(reviseMatch[2]),
        feedback: reviseMatch[3].trim(),
        reviewerPhone,
      });
    }

    const approveMatch = normalizedBody.match(/^SN8\s+APPROVE\s+(\S+)\s+v(\d+)$/i);
    if (approveMatch) {
      return this.validateCommand({
        action: OwnerReviewAction.APPROVE,
        conversationId: approveMatch[1],
        version: Number(approveMatch[2]),
        reviewerPhone,
      });
    }

    return null;
  }

  async handleOwnerCommand(source: ReviewCommandSource): Promise<boolean> {
    if (!this.isOwnerPhone(source.fromPhone)) {
      return false;
    }

    const command = this.parseOwnerCommand(source.body, source.fromPhone);
    if (!command) {
      return false;
    }

    if (command.action === OwnerReviewAction.APPROVE) {
      await this.approveDraft(command);
      await this.sendOwnerAck(
        source.fromPhone,
        `Aprobacion registrada para ${command.conversationId} v${command.version}. La cotizacion fue enviada al cliente.`,
        source.messageId,
      );
      return true;
    }

    await this.requestChanges(command);
    await this.sendOwnerAck(
      source.fromPhone,
      `Cambios registrados para ${command.conversationId} v${command.version}. Se generara una nueva version y la recibiras por este mismo canal.`,
      source.messageId,
    );
    return true;
  }

  async approveDraft(command: OwnerReviewCommandDto): Promise<void> {
    await this.approveDraftWithSource(command, 'whatsapp');
  }

  async approveDraftFromCrm(command: OwnerReviewCommandDto): Promise<void> {
    await this.approveDraftWithSource(command, 'crm');
  }

  async requestChanges(command: OwnerReviewCommandDto): Promise<void> {
    await this.requestChangesWithSource(command, 'whatsapp');
  }

  async requestChangesFromCrm(command: OwnerReviewCommandDto): Promise<void> {
    await this.requestChangesWithSource(command, 'crm');
  }

  private async approveDraftWithSource(
    command: OwnerReviewCommandDto,
    source: ReviewActionSource,
  ): Promise<void> {
    const latestDraft = await this.getLatestDraftForCommand(command);

    await this.prisma.$transaction(async (tx) => {
      const iteration = latestDraft.reviewEvents[0]?.iteration ?? 0;

      await tx.quoteDraft.update({
        where: { id: latestDraft.id },
        data: {
          reviewStatus: 'approved',
          approvedAt: new Date(),
        },
      });

      await tx.quoteReviewEvent.create({
        data: {
          quoteDraftId: latestDraft.id,
          conversationId: latestDraft.conversationId,
          iteration: iteration + 1,
          reviewStatus: 'approved',
          feedback: this.buildApprovalFeedback(command, source),
          resolvedAt: new Date(),
        },
      });

      await tx.commercialBrief.update({
        where: { id: latestDraft.commercialBrief.id },
        data: { status: 'approved' },
      });
    });

    this.logger.log({
      event: 'owner_review_approved',
      conversationId: command.conversationId,
      version: command.version,
      reviewerPhone: command.reviewerPhone ?? null,
    });

    const delivery = await this.prepareApprovedCustomerDelivery(command.conversationId);
    const senderPhoneNumberId =
      this.config.get<string>('KAPSO_PHONE_NUMBER_ID')?.trim() || undefined;
    const externalMessageId = await this.messagingService.sendText(
      delivery.conversationId,
      delivery.body,
      senderPhoneNumberId,
    );
    await this.prisma.quoteDraft.update({
      where: { id: delivery.quoteDraftId },
      data: {
        reviewStatus: 'delivered_to_customer',
        deliveredToCustomerAt: new Date(),
      },
    });
    await this.prisma.message.create({
      data: {
        externalMessageId,
        direction: 'outbound',
        fromPhone: senderPhoneNumberId ?? 'ai-sales',
        toPhone: delivery.conversationId,
        body: delivery.body,
        channel: 'whatsapp',
        rawPayload: {
          externalMessageId,
          direction: 'outbound',
          fromPhone: senderPhoneNumberId ?? 'ai-sales',
          toPhone: delivery.conversationId,
          body: delivery.body,
          source: 'ai-sales-customer-delivery',
          quoteDraftId: delivery.quoteDraftId,
          version: delivery.version,
        },
      },
    });
  }

  private async requestChangesWithSource(
    command: OwnerReviewCommandDto,
    source: ReviewActionSource,
  ): Promise<void> {
    const latestDraft = await this.getLatestDraftForCommand(command);
    const reviewEvent = await this.prisma.$transaction(async (tx) => {
      const iteration = (latestDraft.reviewEvents[0]?.iteration ?? 0) + 1;

      await tx.quoteDraft.update({
        where: { id: latestDraft.id },
        data: {
          reviewStatus: 'changes_requested',
          ownerFeedbackSummary: command.feedback,
        },
      });

      await tx.commercialBrief.update({
        where: { id: latestDraft.commercialBrief.id },
        data: { status: 'quote_in_review' },
      });

      return tx.quoteReviewEvent.create({
        data: {
          quoteDraftId: latestDraft.id,
          conversationId: latestDraft.conversationId,
          iteration,
          reviewStatus: 'changes_requested',
          feedback: this.buildRevisionFeedback(command, source),
        },
      });
    });

    const job = {
      conversationId: latestDraft.conversationId,
      quoteDraftId: latestDraft.id,
      reviewEventId: reviewEvent.id,
      requestedAt: new Date().toISOString(),
    } satisfies ProcessOwnerRevisionJob;

    await this.aiSalesQueue.add(AI_SALES_PROCESS_OWNER_REVISION_JOB, job, {
      jobId: `owner-revision:${latestDraft.id}:${reviewEvent.id}`,
      removeOnComplete: 100,
      removeOnFail: 100,
    });

    this.logger.log({
      event: 'owner_review_changes_requested',
      conversationId: command.conversationId,
      version: command.version,
      reviewEventId: reviewEvent.id,
    });
  }

  async processRevisionJob(job: ProcessOwnerRevisionJob): Promise<QuoteDraft> {
    const [sourceDraft, reviewEvent] = await Promise.all([
      this.prisma.quoteDraft.findUnique({
        where: { id: job.quoteDraftId },
        include: {
          commercialBrief: true,
          reviewEvents: {
            where: { id: job.reviewEventId },
            take: 1,
          },
        },
      }),
      this.prisma.quoteReviewEvent.findUnique({
        where: { id: job.reviewEventId },
      }),
    ]);

    if (!sourceDraft || !reviewEvent) {
      throw new NotFoundException(
        `Owner revision job references missing draft/event (${job.quoteDraftId}/${job.reviewEventId}).`,
      );
    }

    const transcript = await this.buildTranscript(job.conversationId);
    const result = await this.aiSalesService.regenerateQuoteDraft({
      conversationId: job.conversationId,
      transcript,
      ownerFeedback: reviewEvent.feedback,
      previousDraft: sourceDraft.renderedQuote ?? JSON.stringify(sourceDraft.draftPayload),
      commercialBrief: {
        customerName: sourceDraft.commercialBrief.customerName ?? undefined,
        projectType: sourceDraft.commercialBrief.projectType ?? undefined,
        businessProblem: sourceDraft.commercialBrief.businessProblem ?? undefined,
        desiredScope: sourceDraft.commercialBrief.desiredScope ?? undefined,
        budget: sourceDraft.commercialBrief.budget ?? undefined,
        urgency: sourceDraft.commercialBrief.urgency ?? undefined,
        constraints: sourceDraft.commercialBrief.constraints ?? undefined,
        summary: sourceDraft.commercialBrief.summary ?? undefined,
      },
      quoteTemplate: {
        version: sourceDraft.templateVersion ?? 'pending-owner-template',
        title: 'pendiente de revision del socio',
        sections: [],
        note:
          'Esta es una cotizacion preliminar preparada por SN8 Labs y queda sujeta a revision y aprobacion interna antes de cualquier envio final al cliente.',
      },
    });

    const latestDraft = await this.prisma.quoteDraft.findFirst({
      where: { conversationId: job.conversationId },
      orderBy: { version: 'desc' },
    });

    const regeneratedDraft = await this.prisma.$transaction(async (tx) => {
      const draftPayload: Prisma.InputJsonObject = {
        summary: result.summary,
        structuredDraft: result.structuredDraft as Prisma.InputJsonValue,
        renderedQuote: result.renderedQuote,
        ownerReviewNotes: (result.ownerReviewNotes ?? []) as Prisma.InputJsonValue,
        customerSafeStatus: result.customerSafeStatus ?? null,
        model: result.model,
        sourceDraftId: sourceDraft.id,
        reviewEventId: reviewEvent.id,
      };

      const created = await tx.quoteDraft.create({
        data: {
          commercialBriefId: sourceDraft.commercialBriefId,
          conversationId: job.conversationId,
          version: (latestDraft?.version ?? sourceDraft.version) + 1,
          origin: 'regenerated',
          reviewStatus: 'pending_owner_review',
          templateVersion: sourceDraft.templateVersion,
          draftPayload,
          renderedQuote: result.renderedQuote,
          ownerFeedbackSummary: reviewEvent.feedback,
        },
      });

      await tx.quoteReviewEvent.update({
        where: { id: reviewEvent.id },
        data: { resolvedAt: new Date() },
      });

      await tx.commercialBrief.update({
        where: { id: sourceDraft.commercialBriefId },
        data: { status: 'quote_in_review' },
      });

      return created;
    });

    await this.requestOwnerReview(regeneratedDraft.id);
    return regeneratedDraft;
  }

  async assertLatestDraftApproved(conversationId: string): Promise<QuoteDraft> {
    const latestDraft = await this.prisma.quoteDraft.findFirst({
      where: { conversationId: conversationId.trim() },
      orderBy: { version: 'desc' },
    });

    if (!latestDraft) {
      throw new NotFoundException(
        `No quote draft exists for conversation ${conversationId.trim()}.`,
      );
    }

    if (latestDraft.reviewStatus !== 'approved') {
      throw new BadRequestException(
        `Quote draft ${latestDraft.conversationId} v${latestDraft.version} is not approved for customer delivery.`,
      );
    }

    return latestDraft;
  }

  async prepareApprovedCustomerDelivery(
    conversationId: string,
  ): Promise<ApprovedCustomerDeliveryPayload> {
    const approvedDraft = await this.assertLatestDraftApproved(conversationId);
    const body = approvedDraft.renderedQuote?.trim();

    if (!body) {
      throw new BadRequestException(
        `Approved quote draft ${approvedDraft.conversationId} v${approvedDraft.version} has no rendered quote body.`,
      );
    }

    return {
      conversationId: approvedDraft.conversationId,
      quoteDraftId: approvedDraft.id,
      version: approvedDraft.version,
      body,
    };
  }

  private async getLatestDraftForCommand(
    command: OwnerReviewCommandDto,
  ): Promise<ReviewContext> {
    const latestDraft = await this.prisma.quoteDraft.findFirst({
      where: { conversationId: command.conversationId.trim() },
      orderBy: { version: 'desc' },
      include: {
        commercialBrief: {
          select: {
            id: true,
            conversationId: true,
            customerName: true,
            summary: true,
          },
        },
        reviewEvents: {
          orderBy: { iteration: 'desc' },
          take: 1,
          select: {
            id: true,
            iteration: true,
          },
        },
      },
    });

    if (!latestDraft || latestDraft.version !== command.version) {
      throw new NotFoundException(
        `Quote draft ${command.conversationId} v${command.version} is not the active review version.`,
      );
    }

    if (
      latestDraft.reviewStatus !== 'pending_owner_review' &&
      latestDraft.reviewStatus !== 'ready_for_recheck'
    ) {
      throw new BadRequestException(
        `Quote draft ${command.conversationId} v${command.version} cannot accept owner review commands from state ${latestDraft.reviewStatus}.`,
      );
    }

    return latestDraft;
  }

  private buildOwnerReviewMessage(
    draft: QuoteDraft & {
      commercialBrief: {
        conversationId: string;
        customerName: string | null;
        summary: string | null;
      };
    },
  ): string {
    const summary = this.pickDraftSummary(draft);

    return [
      'Revision interna de cotizacion SN8 Labs',
      `Cliente: ${draft.commercialBrief.customerName ?? draft.conversationId}`,
      `Conversacion: ${draft.conversationId}`,
      `Version de draft: v${draft.version}`,
      `Estado: ${draft.reviewStatus}`,
      '',
      'Resumen comercial:',
      draft.commercialBrief.summary ?? 'Sin resumen disponible.',
      '',
      'Resumen del draft:',
      summary,
      '',
      'Borrador renderizado:',
      draft.renderedQuote ?? '(sin version renderizada)',
      '',
      'Acciones disponibles:',
      `- Aprobar: SN8 APPROVE ${draft.conversationId} v${draft.version}`,
      `- Pedir cambios: SN8 REVISE ${draft.conversationId} v${draft.version} <comentarios>`,
      '',
      'La cotizacion permanece bloqueada para el cliente hasta una aprobacion explicita.',
    ].join('\n');
  }

  private pickDraftSummary(draft: QuoteDraft): string {
    const payload =
      draft.draftPayload && typeof draft.draftPayload === 'object'
        ? (draft.draftPayload as Record<string, unknown>)
        : undefined;
    const summary =
      payload && typeof payload.summary === 'string' ? payload.summary.trim() : '';

    if (summary) {
      return summary;
    }

    return draft.renderedQuote?.slice(0, 280) ?? 'Sin resumen del draft.';
  }

  private async sendOwnerAck(
    ownerPhone: string,
    body: string,
    sourceMessageId?: string,
  ): Promise<void> {
    const senderPhoneNumberId =
      this.config.get<string>('KAPSO_PHONE_NUMBER_ID')?.trim() || undefined;
    const externalMessageId = await this.messagingService.sendText(
      ownerPhone,
      body,
      senderPhoneNumberId,
    );

    await this.prisma.message.create({
      data: {
        externalMessageId,
        direction: 'outbound',
        fromPhone: senderPhoneNumberId ?? 'ai-sales-owner-review',
        toPhone: ownerPhone,
        body,
        channel: 'whatsapp',
        rawPayload: {
          externalMessageId,
          direction: 'outbound',
          fromPhone: senderPhoneNumberId ?? 'ai-sales-owner-review',
          toPhone: ownerPhone,
          body,
          source: 'ai-sales-owner-review-ack',
          replyToMessageId: sourceMessageId ?? null,
        },
      },
    });
  }

  private validateCommand(
    input: Partial<OwnerReviewCommandDto>,
  ): OwnerReviewCommandDto {
    const command = Object.assign(new OwnerReviewCommandDto(), input);
    const errors = validateSync(command, { whitelist: true });
    if (errors.length > 0) {
      throw new BadRequestException('Owner review command is invalid.');
    }

    return command;
  }

  private async buildTranscript(conversationId: string): Promise<string> {
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [{ fromPhone: conversationId }, { toPhone: conversationId }],
      },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        direction: true,
        body: true,
      },
    });

    return messages
      .map(
        (message) =>
          `[${message.createdAt.toISOString()}] ${
            message.direction === 'inbound' ? 'Cliente' : 'SN8'
          }: ${message.body?.trim() || '(sin texto)'}`,
      )
      .join('\n');
  }

  private getOwnerPhone(): string {
    return this.config.get<string>('AI_SALES_OWNER_PHONE')?.trim() ?? '';
  }

  private isOwnerPhone(phone: string): boolean {
    const configuredOwner = this.config.get<string>('AI_SALES_OWNER_PHONE')?.trim();
    return Boolean(configuredOwner && configuredOwner === phone.trim());
  }

  private buildApprovalFeedback(
    command: OwnerReviewCommandDto,
    source: ReviewActionSource,
  ): string {
    return `Approved by ${command.reviewerPhone ?? 'owner'} ${this.describeReviewSource(source)}.`;
  }

  private buildRevisionFeedback(
    command: OwnerReviewCommandDto,
    source: ReviewActionSource,
  ): string {
    const feedback = command.feedback?.trim();
    if (!feedback) {
      return `Changes requested ${this.describeReviewSource(source)}.`;
    }

    return `${feedback} (${this.describeReviewSource(source)})`;
  }

  private describeReviewSource(source: ReviewActionSource): string {
    return source === 'crm' ? 'via CRM' : 'via WhatsApp command';
  }
}
