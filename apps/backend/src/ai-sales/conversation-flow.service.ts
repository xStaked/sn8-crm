import { Injectable, Logger } from '@nestjs/common';
import type { CommercialBrief, QuoteDraft } from '@prisma/client';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiSalesOrchestrator } from './ai-sales.orchestrator';
import { AiSalesService } from './ai-sales.service';
import { MessageVariantService } from './message-variant.service';

const DEFAULT_AUTO_REPLY =
  'Hola, soy el asistente comercial de SN8 Labs. Ya recibi tu mensaje y te voy a guiar para entender tu proyecto antes de preparar una propuesta.';

// Core fields that are truly required to understand the project
const CORE_BRIEF_FIELDS = [
  'projectType',
  'businessProblem',
  'desiredScope',
] as const;

// Optional fields - we try to collect them but don't block the quote if missing
const OPTIONAL_BRIEF_FIELDS = [
  'budget',
  'urgency',
  'constraints',
] as const;

const ALL_BRIEF_FIELDS = [...CORE_BRIEF_FIELDS, ...OPTIONAL_BRIEF_FIELDS] as const;

type RequiredBriefField = (typeof ALL_BRIEF_FIELDS)[number];

type ReplyPlan = {
  body: string;
  source:
    | 'default-auto-reply'
    | 'commercial-discovery'
    | 'commercial-ready-for-quote'
    | 'commercial-review-status'
    | 'commercial-clarification';
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
      // Check if user wants to start a new project even when there's an existing draft
      const userIntent = this.detectUserIntent(input.inboundBody);
      
      if (userIntent === 'wants_new_project') {
        // User explicitly wants to start fresh - delete the brief and all drafts
        await this.prisma.commercialBrief.delete({
          where: { conversationId: normalizedConversationId },
        });
        // Continue to normal flow for new project
        return this.planReply({
          conversationId: input.conversationId,
          inboundMessageId: input.inboundMessageId,
          inboundBody: input.inboundBody,
        });
      }
      
      if (userIntent === 'confused_about_project' || userIntent === 'asking_for_clarification') {
        // Conversational response acknowledging confusion
        const projectSummary = this.buildBriefSummary(currentBrief);
        return {
          body: `Entiendo la confusión. Tengo en mi sistema una propuesta en preparación para *${projectSummary}*. Si este no es el proyecto que quieres, solo dímelo y empezamos de cero. ¿Quieres continuar con este proyecto o hablamos de algo diferente?`,
          source: 'commercial-clarification',
        };
      }
      
      return {
        body: this.buildReviewStatusReply(latestDraft.reviewStatus, normalizedConversationId),
        source: 'commercial-review-status',
      };
    }

    if (currentBrief?.status === 'ready_for_quote') {
      // Detect if user is confused or asking about what project we're discussing
      const userIntent = this.detectUserIntent(input.inboundBody);
      
      if (userIntent === 'confused_about_project' || userIntent === 'asking_for_clarification') {
        // Conversational response acknowledging confusion
        const projectSummary = this.buildBriefSummary(currentBrief);
        return {
          body: `Entiendo la confusión. Tengo en mi brief un proyecto de *${projectSummary}*. ¿Es este el proyecto que quieres cotizar, o prefieres hablar de algo diferente?`,
          source: 'commercial-clarification',
        };
      }
      
      if (userIntent === 'wants_new_project') {
        // User explicitly wants to start fresh - reset brief
        await this.prisma.commercialBrief.delete({
          where: { conversationId: normalizedConversationId },
        });
        // Continue to normal flow for new project
        return this.planReply({
          conversationId: input.conversationId,
          inboundMessageId: input.inboundMessageId,
          inboundBody: input.inboundBody,
        });
      }

      // Brief is complete and already enqueued — re-enqueue in case job failed silently,
      // but don't repeat the same "voy a cotizar" message
      await this.aiSalesOrchestrator.enqueueQualifiedConversation(
        normalizedConversationId,
        'customer-message',
      );
      
      // Varied response based on conversation history to avoid robotic repetition
      const variedResponse = this.buildReadyForQuoteFollowUpResponse(
        currentBrief, 
        normalizedConversationId,
        input.inboundBody,
      );
      
      return {
        body: variedResponse,
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
        urgency: this.mergeUrgencyValue(extractedBrief.urgency, currentBrief?.urgency),
        constraints: this.pickMeaningfulValue(
          extractedBrief.constraints,
          currentBrief?.constraints,
        ),
        summary: this.pickMeaningfulValue(extractedBrief.summary, currentBrief?.summary),
      };
      const extractedMissing = this.resolveExtractedMissingFields(
        extractedBrief.missingInformation,
      );
      // Check core fields (must have these)
      const missingCoreFields = CORE_BRIEF_FIELDS.filter(
        (field) =>
          !this.hasMeaningfulBriefValue(mergedBrief[field]) ||
          (extractedMissing.has(field) && !this.hasMeaningfulBriefValue(currentBrief?.[field])),
      );

      // Check optional fields - only ask if missing AND we haven't tried to get them yet
      // If client said they don't have this info, we accept it and move on
      const missingOptionalFields = OPTIONAL_BRIEF_FIELDS.filter((field) => {
        const hasValue = this.hasMeaningfulBriefValue(mergedBrief[field]);
        const wasAskedBefore = this.hasMeaningfulBriefValue(currentBrief?.[field]);
        const isMarkedAsFlexible = 
          (field === 'budget' && /a definir|presupuesto abierto/i.test(mergedBrief[field] || '')) ||
          (field === 'urgency' && /flexible/i.test(mergedBrief[field] || ''));
        
        // If already marked as flexible/undefined, don't ask again
        if (isMarkedAsFlexible) return false;
        
        // If no value and not asked before, we should ask once
        return !hasValue && !wasAskedBefore && extractedMissing.has(field);
      });

      const missingFields = [...missingCoreFields, ...missingOptionalFields];

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

    // Simple closing without the lengthy summary (the brief is already in the system)
    // Just invite to add more details if needed
    const closing = brief.budget === 'a definir con SN8' || brief.urgency === 'flexible'
      ? ' Si quieres ajustar algo del alcance o agregar detalles, aún estamos a tiempo.'
      : ' Si se te ocurre algo más que quieras agregar, escríbeme antes de que cierre el brief.';

    return `${baseMessage}${closing}`;
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

    // Client explicitly says they don't have a budget or want us to propose
    if (/(no tengo presupuesto|no sé|no se|dime el precio|dime cuanto|cual es el precio|cuanto cuesta|a definir|por definir|me dices tu|tu me dices)/i.test(normalized)) {
      return 'a definir con SN8';
    }

    if (/(no importa|abierto|flexible|sin tope|lo vemos)/i.test(normalized)) {
      return 'presupuesto abierto';
    }

    return this.looksLikeMissingPlaceholder(normalized) ? null : normalized;
  }

  private normalizeUrgencyValue(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    // Client explicitly says they're not in a hurry
    if (/(no tengo prisa|no hay afán|no hay afan|cuando esté|cuando este|sin fecha|flexible|cuando puedas|no urgente)/i.test(normalized)) {
      return 'flexible';
    }

    return this.looksLikeMissingPlaceholder(normalized) ? null : normalized;
  }

  private mergeBudgetValue(
    primary: string | null | undefined,
    fallback: string | null | undefined,
  ): string | null {
    return this.normalizeBudgetValue(primary) ?? this.normalizeBudgetValue(fallback);
  }

  private mergeUrgencyValue(
    primary: string | null | undefined,
    fallback: string | null | undefined,
  ): string | null {
    return this.normalizeUrgencyValue(primary) ?? this.normalizeUrgencyValue(fallback);
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

    const lowerBody = body.toLowerCase();
    
    // Explicit new project patterns
    const newProjectPatterns = [
      /otro proyecto/i,
      /otra cosa/i,
      /otra aplicaci[oó]n/i,
      /otro sistema/i,
      /nueva? cotizaci[oó]n/i,
      /nuevo proyecto/i,
      /nueva? propuesta/i,
      /empezar de nuevo/i,
      /empezar de cero/i,
      /cotizar otro/i,
      /cotizar otra/i,
      /diferente proyecto/i,
      /pidiendo otra/i,
      /quiero otra/i,
      /es otro/i,
      /es diferente/i,
      /cambiar de proyecto/i,
      /cambiar el proyecto/i,
      /no es ese proyecto/i,
      /no es ese/i,
      /no quiero eso/i,
      /no es lo que quiero/i,
      /hablar de otra cosa/i,
      /hablamos de otra cosa/i,
    ];
    
    return newProjectPatterns.some(p => p.test(lowerBody));
  }

  /**
   * Detect user intent from their message to handle edge cases
   */
  private detectUserIntent(body: string | null): 'confused_about_project' | 'asking_for_clarification' | 'wants_new_project' | 'continuing' {
    if (!body) return 'continuing';
    
    const lowerBody = body.toLowerCase();
    
    // Confusion patterns
    const confusionPatterns = [
      /de qu[eé] proyecto/i,
      /informaci[óo]n de qu[eé]/i,
      /no entiendo/i,
      /qu[eé] es esto/i,
      /de qu[eé] hablamos/i,
      /no habl[eé] de/i,
      /no ped[ií]/i,
      /qu[eé] cotizaci[óo]n/i,
      /qu[eé] propuesta/i,
      /no es mio/i,
      /no es mi/i,
      /error/i,
      /equivocad/i,
      /ablame/i,  // "hablame" sin h
      /cuentame/i,
      /explicate/i,
      /c[oó]mo as[ií]/i,  // "como asi", "cómo así"
      /qu[eé] hablas/i,
      /de qu[eé] hablas/i,
      /no te entiendo/i,
      /a qu[eé] te refieres/i,
      /no me suena/i,
      /eso no es/i,
      /eso no tiene/i,
      /qu[eé] tiene que ver/i,
    ];
    
    if (confusionPatterns.some(p => p.test(lowerBody))) {
      return 'confused_about_project';
    }
    
    // New project intent (additional to the main detector)
    if (this.detectsNewProjectIntent(body)) {
      return 'wants_new_project';
    }
    
    return 'continuing';
  }

  /**
   * Build a brief summary of the current brief for clarification
     */
  private buildBriefSummary(brief: CommercialBriefWithLatestDraft | null): string {
    if (!brief) return 'proyecto no identificado';
    
    const parts: string[] = [];
    
    if (brief.projectType) {
      parts.push(brief.projectType);
    }
    
    if (brief.businessProblem) {
      // Truncate if too long
      const shortProblem = brief.businessProblem.length > 50 
        ? brief.businessProblem.substring(0, 50) + '...'
        : brief.businessProblem;
      parts.push(`para ${shortProblem}`);
    }
    
    if (parts.length === 0 && brief.summary) {
      const shortSummary = brief.summary.length > 60
        ? brief.summary.substring(0, 60) + '...'
        : brief.summary;
      return shortSummary;
    }
    
    return parts.join(' ') || 'proyecto en definición';
  }

  /**
   * Build varied follow-up response when brief is ready for quote
   */
  private buildReadyForQuoteFollowUpResponse(
    brief: CommercialBriefWithLatestDraft,
    conversationId: string,
    userMessage?: string | null,
  ): string {
    // Check if user seems confused based on message content
    const confusionIndicators = [
      /como asi/i,
      /como así/i,
      /c[oó]mo as[ií]/i,
      /qu[eé] es eso/i,
      /no entiendo/i,
      /de qu[eé] hablas/i,
      /qu[eé] hablas/i,
      /a qu[eé] te refieres/i,
    ];
    
    const seemsConfused = userMessage && confusionIndicators.some(p => p.test(userMessage.toLowerCase()));
    
    // If user seems confused, provide clarification with option to start fresh
    if (seemsConfused) {
      const projectSummary = this.buildBriefSummary(brief);
      return `Entiendo la confusión. Tengo en mi sistema un brief para *${projectSummary}*. Si este proyecto no es el que quieres cotizar ahora, solo dímelo y empezamos de cero con tu nueva idea. ¿Te gustaría continuar con este proyecto o hablamos de algo diferente?`;
    }
    
    // If user asked a specific question, acknowledge it
    if (userMessage && userMessage.length > 10) {
      const responses = [
        `Recibido. Ya tengo tu brief completo para ${brief.projectType || 'el proyecto'}. Estoy preparando la propuesta y te aviso cuando esté lista. ¿Algo más que deba considerar mientras tanto?`,
        `Gracias por el mensaje. Tu propuesta para ${brief.projectType || 'este proyecto'} está en preparación. Te contacto en cuanto esté lista para revisión.`,
        `Noted. Estoy en proceso de preparar tu cotización para ${brief.projectType || 'lo que conversamos'}. Te aviso en cuanto tenga novedades.`,
      ];
      const index = this.hashStringToIndex(conversationId, responses.length);
      return responses[index];
    }
    
    // Generic but varied responses
    const responses = [
      'Ya tenemos tu información completa. Estamos preparando la propuesta preliminar y te avisamos cuando esté lista para revisión interna.',
      'Tu brief está completo y la propuesta está en preparación. Te contacto en cuanto esté lista.',
      'Recibido. Estoy finalizando tu propuesta. Te aviso en cuanto pase a revisión interna.',
    ];
    const index = this.hashStringToIndex(conversationId, responses.length);
    return responses[index];
  }

  private hashStringToIndex(str: string, max: number): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) % max;
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
