import { Injectable, Logger } from '@nestjs/common';
import type { CommercialBrief, QuoteDraft } from '@prisma/client';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiSalesOrchestrator } from './ai-sales.orchestrator';
import { AiSalesService } from './ai-sales.service';
import { MessageVariantService } from './message-variant.service';

const DEFAULT_AUTO_REPLY =
  'Hola, soy el asistente comercial de SN8 Labs. Ya recibi tu mensaje y te voy a guiar para entender tu proyecto antes de preparar una propuesta.';

const REQUIRED_BRIEF_FIELDS = [
  'projectType',
  'businessProblem',
  'desiredScope',
  'budget',
  'urgency',
  'constraints',
] as const;

type RequiredBriefField = (typeof REQUIRED_BRIEF_FIELDS)[number];

type ReplyPlan = {
  body: string;
  source:
    | 'default-auto-reply'
    | 'commercial-discovery'
    | 'commercial-ready-for-quote'
    | 'commercial-review-status';
};

type CommercialBriefWithLatestDraft = CommercialBrief & {
  quoteDrafts: QuoteDraft[];
};

type MergedCommercialBrief = {
  customerName: string | null;
  projectType: string | null;
  businessProblem: string | null;
  desiredScope: string | null;
  budget: string | null;
  urgency: string | null;
  constraints: string | null;
  summary: string | null;
};

type ExtractedMissingField =
  | RequiredBriefField
  | 'customerName';

const MISSING_FIELD_HINTS: Record<ExtractedMissingField, RegExp[]> = {
  customerName: [/nombre/i, /como prefieres que te llame/i],
  projectType: [/tipo de proyecto/i, /tipo de solucion/i, /project type/i],
  businessProblem: [/problema/i, /objetivo principal/i, /que quieres resolver/i],
  desiredScope: [/alcance/i, /mvp/i, /primera version/i, /funciones clave/i],
  budget: [/presupuesto/i, /budget/i, /rango/i],
  urgency: [/urgencia/i, /fecha objetivo/i, /timeline/i, /tiempo/i],
  constraints: [/restricciones/i, /integraciones/i, /tecnologia/i, /constraint/i],
};

@Injectable()
export class ConversationFlowService {
  private readonly logger = new Logger(ConversationFlowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly aiSalesService: AiSalesService,
    private readonly aiSalesOrchestrator: AiSalesOrchestrator,
    private readonly messageVariantService: MessageVariantService,
  ) {}

  async planReply(input: {
    conversationId: string;
    inboundMessageId: string;
    inboundBody: string | null;
  }): Promise<ReplyPlan> {
    const normalizedConversationId = input.conversationId.trim();
    let currentBrief = await this.prisma.commercialBrief.findUnique({
      where: { conversationId: normalizedConversationId },
      include: {
        quoteDrafts: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    // If user explicitly requests a new/different project, reset the existing brief
    let newProjectStartMessageId: string | null = null;
    if (currentBrief && this.detectsNewProjectIntent(input.inboundBody)) {
      await this.prisma.commercialBrief.delete({
        where: { conversationId: normalizedConversationId },
      });
      currentBrief = null;
      newProjectStartMessageId = input.inboundMessageId;
    } else if (currentBrief?.conversationContext?.['newProjectStartMessageId']) {
      // Use persisted new project marker for subsequent messages
      newProjectStartMessageId = currentBrief.conversationContext['newProjectStartMessageId'];
    }

    const latestDraft = currentBrief?.quoteDrafts[0];
    if (latestDraft) {
      return {
        body: this.buildReviewStatusReply(latestDraft.reviewStatus, normalizedConversationId),
        source: 'commercial-review-status',
      };
    }

    if (currentBrief?.status === 'ready_for_quote') {
      // Brief is complete and already enqueued — re-enqueue in case job failed silently,
      // but don't repeat the same "voy a cotizar" message
      await this.aiSalesOrchestrator.enqueueQualifiedConversation(
        normalizedConversationId,
        'customer-message',
      );
      return {
        body: 'Ya tenemos tu información completa. Estamos preparando la propuesta preliminar y te avisamos cuando ya esté lista para revisión interna.',
        source: 'commercial-review-status',
      };
    }

    try {
      const allMessages =
        await this.conversationsService.listConversationMessages(normalizedConversationId);

      // When a new project was just requested, only use messages from that point forward
      // so the old project context doesn't pollute the new brief extraction.
      let messages = allMessages;
      if (newProjectStartMessageId) {
        const startIndex = allMessages.findIndex((m) => m.id === newProjectStartMessageId);
        if (startIndex >= 0) {
          messages = allMessages.slice(startIndex);
        }
      }

      const transcript = messages
        .map(
          (message) =>
            `[${message.createdAt}] ${message.direction === 'inbound' ? 'Cliente' : 'SN8'}: ${
              message.body?.trim() || '(sin texto)'
            }`,
        )
        .join('\n');

      const extractedBrief = await this.aiSalesService.extractCommercialBrief(
        normalizedConversationId,
        transcript,
        currentBrief ?? undefined,
      );

      // Extract conversation context for better replies
      const conversationContext = await this.extractConversationContext(transcript);
      const mergedBrief: MergedCommercialBrief = {
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
        urgency: this.pickMeaningfulValue(
          extractedBrief.urgency,
          currentBrief?.urgency,
        ),
        constraints: this.pickMeaningfulValue(
          extractedBrief.constraints,
          currentBrief?.constraints,
        ),
        summary: this.pickMeaningfulValue(extractedBrief.summary, currentBrief?.summary),
      };
      const extractedMissing = this.resolveExtractedMissingFields(
        extractedBrief.missingInformation,
      );
      const missingFields = REQUIRED_BRIEF_FIELDS.filter(
        (field) =>
          !this.hasMeaningfulBriefValue(mergedBrief[field]) ||
          (extractedMissing.has(field) && !this.hasMeaningfulBriefValue(currentBrief?.[field])),
      );

      // Persist new project marker if this is a new project start
      const contextWithNewProjectMarker = {
        ...conversationContext,
        ...(newProjectStartMessageId ? { newProjectStartMessageId } : {}),
      };

      await this.prisma.commercialBrief.upsert({
        where: { conversationId: normalizedConversationId },
        create: {
          conversationId: normalizedConversationId,
          status: missingFields.length > 0 ? 'collecting' : 'ready_for_quote',
          ...mergedBrief,
          sourceTranscript: messages,
          conversationContext: contextWithNewProjectMarker as any,
        },
        update: {
          status: missingFields.length > 0 ? 'collecting' : 'ready_for_quote',
          ...mergedBrief,
          sourceTranscript: messages,
          conversationContext: contextWithNewProjectMarker as any,
        },
      });

      if (missingFields.length > 0) {
        let replyBody: string;
        try {
          replyBody = await this.aiSalesService.generateDiscoveryReply({
            transcript,
            missingField: missingFields[0],
            isFirstTouch: !currentBrief,
            knownProjectType: mergedBrief.projectType,
            customerName: mergedBrief.customerName,
            conversationContext: conversationContext ?? undefined,
          });
        } catch (replyError) {
          this.logger.warn({
            event: 'discovery_reply_ai_fallback',
            conversationId: normalizedConversationId,
            missingField: missingFields[0],
            error: replyError instanceof Error ? replyError.message : String(replyError),
          });
          replyBody = this.buildStaticDiscoveryFallback(missingFields[0], !currentBrief, mergedBrief.projectType);
        }
        return {
          body: replyBody,
          source: 'commercial-discovery',
        };
      }

      await this.aiSalesOrchestrator.enqueueQualifiedConversation(
        normalizedConversationId,
        'customer-message',
      );

      return {
        body: this.buildReadyForQuoteReply(mergedBrief, normalizedConversationId),
        source: 'commercial-ready-for-quote',
      };
    } catch (error) {
      this.logger.error({
        event: 'conversation_flow_fallback_triggered',
        conversationId: normalizedConversationId,
        inboundMessageId: input.inboundMessageId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        body: DEFAULT_AUTO_REPLY,
        source: 'default-auto-reply',
      };
    }
  }

  private buildStaticDiscoveryFallback(
    missingField: RequiredBriefField,
    isFirstTouch: boolean,
    projectType: string | null,
  ): string {
    const intro = isFirstTouch
      ? 'Hola, soy el asesor comercial de SN8 Labs.'
      : 'Sigo contigo.';
    const questions: Record<RequiredBriefField, string> = {
      projectType: 'Que tipo de solucion quieres construir?',
      businessProblem: 'Cual es el problema principal que quieres resolver?',
      desiredScope: projectType
        ? `Que debe incluir la primera version de ese ${projectType}?`
        : 'Que funciones clave debe tener la primera version?',
      budget: 'Que rango de presupuesto manejas?',
      urgency: 'Tienes fecha objetivo o ventana para arrancar?',
      constraints: 'Hay alguna restriccion importante que deba considerar?',
    };
    return `${intro} ${questions[missingField]}`;
  }

  private buildReviewStatusReply(
    reviewStatus: QuoteDraft['reviewStatus'],
    conversationId: string,
  ): string {
    switch (reviewStatus) {
      case 'delivered_to_customer':
        return this.messageVariantService.getReviewStatusVariant(
          'delivered_to_customer',
          conversationId,
        );
      case 'approved':
        return 'Tu propuesta ya fue aprobada internamente. Estamos preparando el siguiente paso para compartirla contigo por este mismo canal.';
      case 'changes_requested':
        return this.messageVariantService.getReviewStatusVariant(
          'changes_requested',
          conversationId,
        );
      case 'ready_for_recheck':
      case 'pending_owner_review':
      default:
        return this.messageVariantService.getReviewStatusVariant(
          'pending_owner_review',
          conversationId,
        );
    }
  }

  private buildReadyForQuoteReply(
    brief: MergedCommercialBrief,
    conversationId: string,
  ): string {
    // Use message variant service for varied, natural responses
    const baseMessage = this.messageVariantService.getReadyForQuoteVariant(
      brief.projectType,
      {
        hasUrgency: !!brief.urgency,
        hasBudget: !!brief.budget,
        conversationId,
      },
    );

    // Build context summary
    const summaryParts = [
      brief.businessProblem?.trim(),
      brief.desiredScope?.trim(),
      brief.budget?.trim() ? `presupuesto ${brief.budget.trim()}` : null,
      brief.urgency?.trim() ? `tiempo ${brief.urgency.trim()}` : null,
    ].filter((value): value is string => Boolean(value));

    const normalizedSummary =
      (summaryParts.length > 0 ? summaryParts.join('; ') : null)?.replace(/[.\s]+$/, '') ??
      null;

    // Combine variant message with context
    const context = normalizedSummary
      ? ` Entendí esto como base: ${normalizedSummary}.`
      : '';

    // Add closing that invites more details
    const closing =
      ' Si quieres, todavía puedes responder con más detalle sobre alcance, presupuesto o prioridad y lo incorporo antes de cerrarla.';

    return `${baseMessage}${context}${closing}`;
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

  private hasMeaningfulBriefValue(value: string | null | undefined): boolean {
    return this.sanitizeBriefValue(value) !== null;
  }

  private normalizeBudgetValue(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
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

  private looksLikeMissingPlaceholder(value: string): boolean {
    return /(falta|faltan|missing|pendiente|por definir|por confirmar|sin definir|no especificado|no proporcionado|desconocido|informacion adicional|información adicional|se requiere|hace falta)/i.test(
      value,
    );
  }

  private detectsNewProjectIntent(body: string | null): boolean {
    if (!body) {
      return false;
    }

    return /(otro proyecto|otra cosa|otra aplicaci[oó]n|otro sistema|nueva? cotizaci[oó]n|nuevo proyecto|nueva? propuesta|empezar de nuevo|empezar de cero|cotizar otro|cotizar otra|diferente proyecto|pidiendo otra|quiero otra|es otro|es diferente)/i.test(
      body,
    );
  }

  private resolveExtractedMissingFields(
    missingInformation: string[] | undefined,
  ): Set<ExtractedMissingField> {
    const resolved = new Set<ExtractedMissingField>();

    for (const item of missingInformation ?? []) {
      for (const [field, patterns] of Object.entries(MISSING_FIELD_HINTS) as Array<
        [ExtractedMissingField, RegExp[]]
      >) {
        if (patterns.some((pattern) => pattern.test(item))) {
          resolved.add(field);
        }
      }
    }

    return resolved;
  }

  /**
   * Extract conversational context from the transcript
   * Uses heuristics to determine tone, topics, and concerns
   */
  private extractConversationContext(transcript: string): {
    previousTopics: string[];
    customerTone: 'formal' | 'casual' | 'technical';
    expressedConcerns: string[];
  } | null {
    try {
      const topics: string[] = [];
      const concerns: string[] = [];

      // Extract potential topics (capitalized phrases, quoted terms)
      const topicMatches = transcript.match(/(?:CRM|app|aplicación|sistema|web|mobile|ecommerce|automatización|dashboard|API|integración|whatsapp|instagram|redes|cloud|servidor)/gi);
      if (topicMatches) {
        topics.push(...new Set(topicMatches.map(t => t.toLowerCase())));
      }

      // Detect concerns based on keywords
      if (/presupuesto|costo|precio|barato|caro|dinero/i.test(transcript)) {
        concerns.push('presupuesto');
      }
      if (/tiempo|urgencia|ya|pronto|fecha|demora|lento/i.test(transcript)) {
        concerns.push('tiempo');
      }
      if (/complejo|difícil|imposible|no se puede|problema/i.test(transcript)) {
        concerns.push('complejidad');
      }
      if (/tecnología|stack|lenguaje|plataforma|hosting/i.test(transcript)) {
        concerns.push('tecnología');
      }

      // Detect tone
      let tone: 'formal' | 'casual' | 'technical' = 'casual';
      const formalIndicators = /usted|estimado|cordial|saludos|atentamente|empresa/i;
      const technicalIndicators = /api|endpoint|database|frontend|backend|deploy|server|json|rest|graphql/i;

      if (technicalIndicators.test(transcript)) {
        tone = 'technical';
      } else if (formalIndicators.test(transcript)) {
        tone = 'formal';
      }

      // Only return if we have meaningful context
      if (topics.length === 0 && concerns.length === 0) {
        return null;
      }

      return {
        previousTopics: topics.slice(0, 5), // Limit to 5 topics
        customerTone: tone,
        expressedConcerns: concerns,
      };
    } catch (error) {
      this.logger.warn({
        event: 'conversation_context_extraction_failed',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
