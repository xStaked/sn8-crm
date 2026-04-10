import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { END, START, StateGraph } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import pg from 'pg';
import { forwardRef, Inject } from '@nestjs/common';
import { ConversationsService } from '../../conversations/conversations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiSalesOrchestrator } from '../ai-sales.orchestrator';
import { AiSalesService } from '../ai-sales.service';
import { MessageVariantService } from '../message-variant.service';
import { QuotePdfAccessLinkService } from '../../quote-documents/quote-pdf-access-link.service';
import { AiIntentClassifierService } from '../ai-intent-classifier.service';
import { DynamicResponseGeneratorService } from '../dynamic-response-generator.service';
import { ConversationQualityCheckerService } from '../conversation-quality-checker.service';
import { SalesGraphAnnotation, type SalesGraphStateType } from './sales-graph.state';
import {
  CORE_BRIEF_FIELDS,
  OPTIONAL_BRIEF_FIELDS,
  buildBriefSummary,
  buildStaticDiscoveryFallback,
  detectsNewProjectIntent,
  estimateMissingFields,
  extractConversationContext,
  hasMeaningfulBriefValue,
  isDraftArchived,
  looksLikeLargePlatformRequest,
  mapBriefStatus,
  mapQuoteReviewStatus,
  mergeBudgetValue,
  mergeUrgencyValue,
  pickLatestActiveDraft,
  pickMeaningfulValue,
  resolveExtractedMissingFields,
  safeJsonObject,
  type MergedBrief,
} from './sales-graph.helpers';

@Injectable()
export class SalesGraphFactory implements OnModuleInit {
  private readonly logger = new Logger(SalesGraphFactory.name);
  // biome-ignore lint: assigned in onModuleInit
  private graph!: ReturnType<typeof this.buildGraph>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversationsService: ConversationsService,
    private readonly aiSalesService: AiSalesService,
    @Inject(forwardRef(() => AiSalesOrchestrator))
    private readonly aiSalesOrchestrator: AiSalesOrchestrator,
    private readonly messageVariantService: MessageVariantService,
    private readonly quotePdfAccessLinkService: QuotePdfAccessLinkService,
    private readonly aiIntentClassifierService: AiIntentClassifierService,
    private readonly dynamicResponseGeneratorService: DynamicResponseGeneratorService,
    private readonly conversationQualityCheckerService: ConversationQualityCheckerService,
  ) {}

  async onModuleInit(): Promise<void> {
    const connectionString = this.config.getOrThrow<string>('DATABASE_URL');
    const pool = new pg.Pool({ connectionString });
    const checkpointer = new PostgresSaver(pool);
    await checkpointer.setup();
    this.graph = this.buildGraph(checkpointer);
    this.logger.log({ event: 'sales_graph_initialized' });
  }

  getGraph() {
    return this.graph;
  }

  // ---------------------------------------------------------------------------
  // Graph construction
  // ---------------------------------------------------------------------------

  private buildGraph(checkpointer: PostgresSaver) {
    return new StateGraph(SalesGraphAnnotation)
      .addNode('load_context', this.loadContext.bind(this))
      .addNode('classify_intent', this.classifyIntent.bind(this))
      .addNode('handle_new_project', this.handleNewProject.bind(this))
      .addNode('run_discovery_extraction', this.runDiscoveryExtraction.bind(this))
      .addNode('evaluate_brief_readiness', this.evaluateBriefReadiness.bind(this))
      .addNode('ask_discovery_question', this.askDiscoveryQuestion.bind(this))
      .addNode('enqueue_quote_generation', this.enqueueQuoteGeneration.bind(this))
      .addNode('reply_review_status', this.replyReviewStatus.bind(this))
      .addNode('handle_delivered_quote', this.handleDeliveredQuote.bind(this))
      .addNode('handle_clarification', this.handleClarification.bind(this))
      .addNode('human_handoff', this.humanHandoff.bind(this))
      .addNode('finalize_reply', this.finalizeReply.bind(this))
      .addEdge(START, 'load_context')
      .addEdge('load_context', 'classify_intent')
      .addConditionalEdges('classify_intent', this.routeAfterClassify.bind(this), {
        handle_new_project: 'handle_new_project',
        handle_delivered_quote: 'handle_delivered_quote',
        reply_review_status: 'reply_review_status',
        handle_clarification: 'handle_clarification',
        human_handoff: 'human_handoff',
        evaluate_brief_readiness: 'evaluate_brief_readiness',
        run_discovery_extraction: 'run_discovery_extraction',
      })
      .addEdge('handle_new_project', 'run_discovery_extraction')
      .addEdge('run_discovery_extraction', 'evaluate_brief_readiness')
      .addConditionalEdges('evaluate_brief_readiness', this.routeAfterEvaluate.bind(this), {
        ask_discovery_question: 'ask_discovery_question',
        enqueue_quote_generation: 'enqueue_quote_generation',
      })
      .addEdge('ask_discovery_question', 'finalize_reply')
      .addEdge('enqueue_quote_generation', 'finalize_reply')
      .addEdge('reply_review_status', 'finalize_reply')
      .addEdge('handle_delivered_quote', 'finalize_reply')
      .addEdge('handle_clarification', 'finalize_reply')
      .addEdge('human_handoff', 'finalize_reply')
      .addEdge('finalize_reply', END)
      .compile({ checkpointer });
  }

  // ---------------------------------------------------------------------------
  // Routing
  // ---------------------------------------------------------------------------

  private routeAfterClassify(state: SalesGraphStateType): string {
    const { intent, shouldNotifyHuman, quoteReviewStatus } = state;

    if (intent === 'new_project') return 'handle_new_project';
    if (intent === 'post_delivery' || quoteReviewStatus === 'delivered_to_customer') return 'handle_delivered_quote';
    if (intent === 'quote_status') return 'reply_review_status';
    if (intent === 'clarification') return 'handle_clarification';
    if (intent === 'human_handoff' || shouldNotifyHuman) return 'human_handoff';
    if (intent === 'brief_complete') return 'evaluate_brief_readiness';
    return 'run_discovery_extraction';
  }

  private routeAfterEvaluate(state: SalesGraphStateType): string {
    return state.missingFields.length > 0 ? 'ask_discovery_question' : 'enqueue_quote_generation';
  }

  // ---------------------------------------------------------------------------
  // Nodes
  // ---------------------------------------------------------------------------

  private async loadContext(state: SalesGraphStateType): Promise<Partial<SalesGraphStateType>> {
    const { conversationId } = state;

    const [allMessages, currentBrief] = await Promise.all([
      this.conversationsService.listConversationMessages(conversationId),
      this.prisma.commercialBrief.findUnique({
        where: { conversationId },
        include: { quoteDrafts: { orderBy: { version: 'desc' }, take: 10 } },
      }),
    ]);

    const ctx = safeJsonObject((currentBrief as any)?.conversationContext);
    const newProjectStartMessageId =
      typeof ctx.newProjectStartMessageId === 'string'
        ? ctx.newProjectStartMessageId
        : undefined;

    let messages = allMessages;
    if (newProjectStartMessageId) {
      const startIndex = allMessages.findIndex((m) => m.id === newProjectStartMessageId);
      if (startIndex >= 0) messages = allMessages.slice(startIndex);
    }

    const transcript = messages
      .map(
        (m) =>
          `[${m.createdAt}] ${m.direction === 'inbound' ? 'Cliente' : 'SN8'}: ${m.body?.trim() || '(sin texto)'}`,
      )
      .join('\n');

    const latestDraft = pickLatestActiveDraft(currentBrief?.quoteDrafts ?? []);
    const missingFields = estimateMissingFields(currentBrief);
    const briefSummary = buildBriefSummary(currentBrief);

    return {
      transcript,
      briefId: currentBrief?.id,
      briefStatus: mapBriefStatus(currentBrief?.status),
      briefSummary,
      missingFields,
      quoteDraftId: latestDraft?.id,
      quoteDraftVersion: latestDraft?.version ?? undefined,
      quoteReviewStatus: mapQuoteReviewStatus(latestDraft?.reviewStatus),
      newProjectStartMessageId,
    };
  }

  private async classifyIntent(state: SalesGraphStateType): Promise<Partial<SalesGraphStateType>> {
    const { inboundBody, briefId, briefStatus, quoteReviewStatus, transcript } = state;

    // Frustration check → human handoff (highest priority, keep regex for immediate detection)
    const frustrationPatterns = [
      /hpta/i, /hp/i, /mierda/i, /carajo/i, /puta/i, /estupido/i, /est[uú]pido/i,
      /pendejo/i, /imb[eé]cil/i, /idiota/i,
    ];
    if (inboundBody && frustrationPatterns.some((p) => p.test(inboundBody))) {
      return { intent: 'human_handoff', shouldNotifyHuman: true };
    }

    // CRITICAL: Check for new project intent FIRST, even if there's a delivered quote
    // This handles the case where user clicks "Cotizar proyecto" button or says "cotizar proyecto"
    // when they already have a delivered quote - they want a NEW project, not responding to old one
    if (briefId && detectsNewProjectIntent(inboundBody)) {
      return { intent: 'new_project' };
    }

    // Also check for explicit "cotizar proyecto" without "otro/nuevo" when there's existing context
    // This catches button clicks and simple requests
    if (briefId && inboundBody && /cotizar\s+(proyecto|propuesta|landing|crm|app|automatizaci[oó]n)/i.test(inboundBody)) {
      return { intent: 'new_project' };
    }

    // Use AI-powered intent classification with context
    try {
      const aiClassification = await this.aiIntentClassifierService.classifyIntent({
        message: inboundBody,
        context: {
          hasBrief: !!briefId,
          briefStatus: briefStatus || undefined,
          hasDraft: !!quoteReviewStatus,
          draftReviewStatus: quoteReviewStatus || undefined,
          conversationHistory: transcript ? transcript.split('\n').slice(-5).join('\n') : undefined,
        },
      });

      if (aiClassification.requiresHuman) {
        return { 
          intent: 'human_handoff', 
          shouldNotifyHuman: true,
          lastError: aiClassification.reasoning,
        };
      }

      // Map AI classification to our intent system
      const intentMapping: Record<string, string> = {
        new_project: 'new_project',
        clarification: 'clarification',
        quote_status: 'quote_status',
        discovery: 'discovery',
        post_delivery: 'post_delivery',
        human_handoff: 'human_handoff',
        quote_acceptance: 'post_delivery',
        quote_questions: 'clarification',
        quote_pdf_request: 'post_delivery',
        greeting: 'discovery',
        off_topic: 'clarification',
      };

      const mappedIntent = intentMapping[aiClassification.intent] || 'discovery';

      return { 
        intent: mappedIntent as any,
        lastError: aiClassification.reasoning,
      };
    } catch (error) {
      this.logger.warn({
        event: 'sales_graph_ai_intent_fallback',
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to rule-based classification
      return this.classifyIntentFallback(state);
    }
  }

  private classifyIntentFallback(state: SalesGraphStateType): Partial<SalesGraphStateType> {
    const { inboundBody, briefId, quoteReviewStatus } = state;

    // When there's an existing context + new project intent → archive and restart
    if (briefId && detectsNewProjectIntent(inboundBody)) {
      return { intent: 'new_project' };
    }

    // Delivered quote handling
    if (quoteReviewStatus === 'delivered_to_customer') {
      return { intent: 'post_delivery' };
    }

    // Active draft (not yet delivered)
    if (quoteReviewStatus) {
      return { intent: 'quote_status' };
    }

    return { intent: 'discovery' };
  }

  private async handleNewProject(
    state: SalesGraphStateType,
  ): Promise<Partial<SalesGraphStateType>> {
    const { conversationId, inboundMessageId } = state;

    const currentBrief = await this.prisma.commercialBrief.findUnique({
      where: { conversationId },
      include: {
        quoteDrafts: {
          select: { id: true, reviewStatus: true, draftPayload: true },
          orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
        },
      },
    });

    if (!currentBrief) {
      return { newProjectStartMessageId: inboundMessageId };
    }

    const archivedAt = new Date().toISOString();
    const activeDrafts = currentBrief.quoteDrafts.filter((d) => !isDraftArchived(d.draftPayload));
    const existingContext = safeJsonObject((currentBrief as any).conversationContext);
    const existingLifecycle = safeJsonObject(existingContext.quoteLifecycle);

    await this.prisma.$transaction(async (tx) => {
      for (const draft of activeDrafts) {
        const payload = safeJsonObject(draft.draftPayload);
        const lifecycle = safeJsonObject(payload.lifecycle);
        await tx.quoteDraft.update({
          where: { id: draft.id },
          data: {
            reviewStatus:
              draft.reviewStatus === 'pending_owner_review' ||
              draft.reviewStatus === 'ready_for_recheck'
                ? 'changes_requested'
                : draft.reviewStatus,
            draftPayload: {
              ...payload,
              lifecycle: {
                ...lifecycle,
                archivedAt,
                archivedBy: 'sales_graph',
                archiveReason: 'new_project_intent',
              },
            },
          },
        });
      }

      await tx.commercialBrief.update({
        where: { conversationId },
        data: {
          status: 'collecting',
          projectType: null,
          businessProblem: null,
          desiredScope: null,
          budget: null,
          urgency: null,
          constraints: null,
          summary: null,
          sourceTranscript: null,
          conversationContext: {
            ...existingContext,
            newProjectStartMessageId: inboundMessageId,
            quoteLifecycle: {
              ...existingLifecycle,
              state: 'brief_collecting',
              updatedAt: archivedAt,
              lastIntentResetAt: archivedAt,
              lastArchiveReason: 'new_project_intent',
              archivedDraftCount: activeDrafts.length,
            },
          },
        } as any,
      });
    });

    this.logger.log({
      event: 'sales_graph_new_project_archived',
      conversationId,
      archivedDraftCount: activeDrafts.length,
    });

    return {
      newProjectStartMessageId: inboundMessageId,
      briefId: undefined,
      briefStatus: 'collecting',
      quoteReviewStatus: undefined,
      quoteDraftId: undefined,
      missingFields: [...CORE_BRIEF_FIELDS],
    };
  }

  private async runDiscoveryExtraction(
    state: SalesGraphStateType,
  ): Promise<Partial<SalesGraphStateType>> {
    const { conversationId, transcript, briefId, newProjectStartMessageId, retries } = state;
    const nodeName = 'run_discovery_extraction';

    try {
      const currentBrief = briefId
        ? await this.prisma.commercialBrief.findUnique({ where: { conversationId } })
        : null;

      const extractedBrief = await this.aiSalesService.extractCommercialBrief(
        conversationId,
        transcript,
        currentBrief ?? undefined,
      );

      const conversationContext = extractConversationContext(transcript);

      const merged: MergedBrief = {
        customerName: pickMeaningfulValue(extractedBrief.customerName, currentBrief?.customerName),
        projectType: pickMeaningfulValue(extractedBrief.projectType, currentBrief?.projectType),
        businessProblem: pickMeaningfulValue(
          extractedBrief.businessProblem,
          currentBrief?.businessProblem,
        ),
        desiredScope: pickMeaningfulValue(extractedBrief.desiredScope, currentBrief?.desiredScope),
        budget: mergeBudgetValue(extractedBrief.budget, currentBrief?.budget),
        urgency: mergeUrgencyValue(extractedBrief.urgency, currentBrief?.urgency),
        constraints: pickMeaningfulValue(extractedBrief.constraints, currentBrief?.constraints),
        summary: pickMeaningfulValue(extractedBrief.summary, currentBrief?.summary),
      };

      const extractedMissing = resolveExtractedMissingFields(extractedBrief.missingInformation);
      const missingCoreFields = CORE_BRIEF_FIELDS.filter(
        (f) =>
          !hasMeaningfulBriefValue(merged[f]) ||
          (extractedMissing.has(f) && !hasMeaningfulBriefValue(currentBrief?.[f])),
      );
      const missingOptionalFields = OPTIONAL_BRIEF_FIELDS.filter((f) => {
        const hasValue = hasMeaningfulBriefValue(merged[f]);
        const wasAskedBefore = hasMeaningfulBriefValue(currentBrief?.[f]);
        const isFlexible =
          (f === 'budget' && /a definir|presupuesto abierto/i.test(merged[f] || '')) ||
          (f === 'urgency' && /flexible/i.test(merged[f] || ''));
        if (isFlexible) return false;
        return !hasValue && !wasAskedBefore && extractedMissing.has(f);
      });
      const missingFields = [...missingCoreFields, ...missingOptionalFields];

      const ctxToStore = {
        ...safeJsonObject((currentBrief as any)?.conversationContext),
        ...(conversationContext ?? {}),
        ...(newProjectStartMessageId ? { newProjectStartMessageId } : {}),
      };

      const upserted = await this.prisma.commercialBrief.upsert({
        where: { conversationId },
        create: {
          conversationId,
          status: missingFields.length > 0 ? 'collecting' : 'ready_for_quote',
          ...merged,
          conversationContext: ctxToStore,
        } as any,
        update: {
          status: missingFields.length > 0 ? 'collecting' : 'ready_for_quote',
          ...merged,
          conversationContext: ctxToStore,
        } as any,
      });

      return {
        briefId: upserted.id,
        briefStatus: mapBriefStatus(upserted.status),
        briefSummary: buildBriefSummary(merged),
        missingFields,
        retries: { ...retries, [nodeName]: 0 }, // Reset retry counter on success
      };
    } catch (error) {
      const retryCount = (retries?.[nodeName] || 0) + 1;
      const maxRetries = 2;

      this.logger.error({
        event: 'sales_graph_node_error',
        node: nodeName,
        conversationId,
        retryCount,
        maxRetries,
        error: error instanceof Error ? error.message : String(error),
      });

      if (retryCount < maxRetries) {
        // Retry by returning to this node
        return {
          retries: { ...retries, [nodeName]: retryCount },
          lastError: `Retry ${retryCount}/${maxRetries} for ${nodeName}`,
        };
      }

      // Max retries exceeded, continue with fallback
      this.logger.error({
        event: 'sales_graph_node_max_retries_exceeded',
        node: nodeName,
        conversationId,
      });

      // Continue graph execution with fallback behavior
      return {
        retries: { ...retries, [nodeName]: retryCount },
        lastError: `Max retries exceeded for ${nodeName}, continuing with fallback`,
      };
    }
  }

  private evaluateBriefReadiness(
    _state: SalesGraphStateType,
  ): Partial<SalesGraphStateType> {
    // Routing is handled by routeAfterEvaluate; this node is a pass-through.
    return {};
  }

  private async askDiscoveryQuestion(
    state: SalesGraphStateType,
  ): Promise<Partial<SalesGraphStateType>> {
    const { conversationId, transcript, missingFields, briefId, retries } = state;
    const nodeName = 'ask_discovery_question';

    try {
      const currentBrief = briefId
        ? await this.prisma.commercialBrief.findUnique({ where: { conversationId } })
        : null;

      const convCtx = extractConversationContext(transcript);
      let responseBody: string;

      try {
        responseBody = await this.aiSalesService.generateDiscoveryReply({
          transcript,
          missingField: missingFields[0],
          isFirstTouch: !currentBrief,
          knownProjectType: currentBrief?.projectType,
          customerName: currentBrief?.customerName,
          conversationContext: convCtx ?? undefined,
        });
      } catch (err) {
        this.logger.warn({
          event: 'sales_graph_discovery_reply_ai_failed',
          conversationId,
          missingField: missingFields[0],
          error: err instanceof Error ? err.message : String(err),
        });
        responseBody = buildStaticDiscoveryFallback(
          missingFields[0],
          !currentBrief,
          currentBrief?.projectType ?? null,
        );
      }

      return { 
        responseBody, 
        responseSource: 'commercial-discovery',
        retries: { ...retries, [nodeName]: 0 },
      };
    } catch (error) {
      const retryCount = (retries?.[nodeName] || 0) + 1;
      const maxRetries = 2;

      this.logger.error({
        event: 'sales_graph_node_error',
        node: nodeName,
        conversationId,
        retryCount,
        maxRetries,
        error: error instanceof Error ? error.message : String(error),
      });

      if (retryCount < maxRetries) {
        return {
          retries: { ...retries, [nodeName]: retryCount },
          lastError: `Retry ${retryCount}/${maxRetries} for ${nodeName}`,
        };
      }

      // Fallback to static response
      return {
        responseBody: buildStaticDiscoveryFallback(
          missingFields[0] || 'projectType',
          !briefId,
          null,
        ),
        responseSource: 'commercial-discovery',
        retries: { ...retries, [nodeName]: retryCount },
        lastError: `Max retries exceeded for ${nodeName}`,
      };
    }
  }

  private async enqueueQuoteGeneration(
    state: SalesGraphStateType,
  ): Promise<Partial<SalesGraphStateType>> {
    const { conversationId, briefId } = state;

    await this.aiSalesOrchestrator.enqueueQualifiedConversation(conversationId, 'customer-message');

    const currentBrief = briefId
      ? await this.prisma.commercialBrief.findUnique({ where: { conversationId } })
      : null;

    const merged: Partial<MergedBrief> = {
      projectType: currentBrief?.projectType ?? null,
      desiredScope: currentBrief?.desiredScope ?? null,
      businessProblem: currentBrief?.businessProblem ?? null,
      budget: currentBrief?.budget ?? null,
      urgency: currentBrief?.urgency ?? null,
    };

    const responseBody = this.buildReadyForQuoteReply(merged, conversationId);
    return { responseBody, responseSource: 'commercial-ready-for-quote' };
  }

  private replyReviewStatus(state: SalesGraphStateType): Partial<SalesGraphStateType> {
    const { conversationId, quoteReviewStatus } = state;

    let responseBody: string;
    switch (quoteReviewStatus) {
      case 'approved':
        responseBody =
          'Tu propuesta ya fue aprobada internamente. Estamos preparando el siguiente paso para compartirla contigo por este mismo canal.';
        break;
      case 'changes_requested':
        responseBody = this.messageVariantService.getReviewStatusVariant(
          'changes_requested',
          conversationId,
        );
        break;
      case 'delivered_to_customer':
        responseBody = this.messageVariantService.getReviewStatusVariant(
          'delivered_to_customer',
          conversationId,
        );
        break;
      default:
        responseBody = this.messageVariantService.getReviewStatusVariant(
          'pending_owner_review',
          conversationId,
        );
    }

    return { responseBody, responseSource: 'commercial-review-status' };
  }

  private async handleDeliveredQuote(state: SalesGraphStateType): Promise<Partial<SalesGraphStateType>> {
    const { inboundBody, conversationId, transcript, briefSummary } = state;
    const lowerMessage = inboundBody?.toLowerCase().trim() || '';

    try {
      // Try dynamic response generation first
      const dynamicResponse = await this.dynamicResponseGeneratorService.generateResponse({
        userMessage: inboundBody || '',
        intent: 'post_delivery',
        context: {
          hasBrief: !!state.briefId,
          briefStatus: state.briefStatus || undefined,
          briefSummary: briefSummary || undefined,
          hasDraft: !!state.quoteDraftId,
          draftReviewStatus: state.quoteReviewStatus || undefined,
          conversationHistory: transcript ? transcript.split('\n').slice(-6).join('\n') : undefined,
        },
      });

      // If dynamic response indicates human handoff, handle it
      if (dynamicResponse.requiresHuman) {
        return {
          responseBody: dynamicResponse.responseBody,
          responseSource: dynamicResponse.responseSource,
          shouldNotifyHuman: true,
        };
      }

      // If it's a PDF request, generate the link
      if (dynamicResponse.responseSource === 'commercial-delivered-pdf-request') {
        const signedPdfLink = this.quotePdfAccessLinkService.buildSignedPublicQuotePdfUrl(conversationId);
        return {
          responseBody: `Puedes descargar la propuesta en PDF aquí: ${signedPdfLink.url}\n\n¿Te quedó claro todo o tienes alguna duda específica?`,
          responseSource: 'commercial-delivered-pdf-request',
        };
      }

      return {
        responseBody: dynamicResponse.responseBody,
        responseSource: dynamicResponse.responseSource,
      };
    } catch (error) {
      this.logger.warn({
        event: 'sales_graph_dynamic_response_fallback_delivered',
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to static pattern-based response
      return this.handleDeliveredQuoteFallback(lowerMessage, conversationId);
    }
  }

  private handleDeliveredQuoteFallback(lowerMessage: string, conversationId: string): Partial<SalesGraphStateType> {
    const proceedPatterns = [
      /avancemos/i, /adelante/i, /ok$/i, /^ok$/i, /^dale$/i, /^va$/i,
      /^si$/i, /^sí$/i, /perfecto/i, /listo/i, /procedamos/i, /empecemos/i,
      /^bueno$/i, /^bien$/i,
    ];
    if (proceedPatterns.some((p) => p.test(lowerMessage))) {
      return {
        responseBody:
          '¡Perfecto! Quedo atento para coordinar el siguiente paso. Un asesor te contactará pronto para formalizar todo. ¿Algo más en lo que pueda ayudarte mientras tanto?',
        responseSource: 'commercial-delivered-acceptance',
      };
    }

    const pdfPatterns = [/pdf/i, /documento/i, /cotizaci[oó]n.*pdf/i, /propuesta.*pdf/i, /env[ií]a.*pdf/i, /manda.*pdf/i, /mandame/i];
    if (pdfPatterns.some((p) => p.test(lowerMessage))) {
      const signedPdfLink = this.quotePdfAccessLinkService.buildSignedPublicQuotePdfUrl(conversationId);
      return {
        responseBody: `Puedes descargar la propuesta en PDF aquí: ${signedPdfLink.url}\n\n¿Te quedó claro todo o tienes alguna duda específica?`,
        responseSource: 'commercial-delivered-pdf-request',
      };
    }

    const questionPatterns = [
      /pregunta/i, /duda/i, /no entiendo/i, /explica/i, /c[oó]mo/i,
      /por qu[eé]/i, /cu[aá]ndo/i, /cu[aá]nto/i, /precio/i, /costo/i,
      /pago/i, /desarrollo/i, /tiempo/i, /plazo/i, /modificar/i, /cambiar/i, /ajustar/i,
    ];
    if (questionPatterns.some((p) => p.test(lowerMessage))) {
      return {
        responseBody:
          'Entiendo que tienes dudas sobre la propuesta. Para darte la mejor atención, voy a pasarte con un asesor humano que puede resolver tus preguntas específicas. Un momento por favor.',
        responseSource: 'commercial-delivered-questions',
      };
    }

    const frustrationPatterns = [
      /hpta/i, /hp/i, /mierda/i, /carajo/i, /puta/i, /estupido/i, /pendejo/i,
      /imb[eé]cil/i, /idiota/i, /no funciona/i, /no sirve/i, /pesimo/i, /p[eé]simo/i,
    ];
    if (frustrationPatterns.some((p) => p.test(lowerMessage))) {
      return {
        responseBody:
          'Lamento la confusión. Parece que hay un problema con nuestra comunicación. Te paso de inmediato con un asesor humano para que te atienda personalmente. Disculpa las molestias.',
        responseSource: 'commercial-human-handoff-frustration',
      };
    }

    return {
      responseBody:
        'Recibido. Si quieres avanzar con la propuesta o tienes alguna pregunta específica, dime y te ayudo. También puedo pasarte con un asesor humano si lo prefieres.',
      responseSource: 'commercial-delivered-follow-up',
    };
  }

  private async handleClarification(state: SalesGraphStateType): Promise<Partial<SalesGraphStateType>> {
    const { briefSummary, quoteReviewStatus, transcript, inboundBody } = state;

    try {
      // Use dynamic response generation for more natural clarification
      const dynamicResponse = await this.dynamicResponseGeneratorService.generateResponse({
        userMessage: inboundBody || '',
        intent: 'clarification',
        context: {
          hasBrief: !!state.briefId,
          briefStatus: state.briefStatus || undefined,
          briefSummary: briefSummary || undefined,
          hasDraft: !!state.quoteDraftId,
          draftReviewStatus: quoteReviewStatus || undefined,
          conversationHistory: transcript ? transcript.split('\n').slice(-6).join('\n') : undefined,
        },
      });

      return {
        responseBody: dynamicResponse.responseBody,
        responseSource: dynamicResponse.responseSource,
      };
    } catch (error) {
      this.logger.warn({
        event: 'sales_graph_clarification_dynamic_fallback',
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to static clarification
      const summary = briefSummary ?? 'proyecto en definición';

      if (quoteReviewStatus) {
        return {
          responseBody: `Entiendo la confusión. Tengo en mi sistema una propuesta en preparación para *${summary}*. Si este no es el proyecto que quieres, solo dímelo y empezamos de cero. ¿Quieres continuar con este proyecto o hablamos de algo diferente?`,
          responseSource: 'commercial-clarification',
        };
      }

      return {
        responseBody: `Entiendo la confusión. Tengo en mi brief un proyecto de *${summary}*. ¿Es este el proyecto que quieres cotizar, o prefieres hablar de algo diferente?`,
        responseSource: 'commercial-clarification',
      };
    }
  }

  private humanHandoff(_state: SalesGraphStateType): Partial<SalesGraphStateType> {
    return {
      shouldNotifyHuman: true,
      responseBody:
        'Lamento la confusión. Te paso de inmediato con un asesor humano para que te atienda personalmente. Disculpa las molestias.',
      responseSource: 'commercial-human-handoff-frustration',
    };
  }

  private async finalizeReply(state: SalesGraphStateType): Promise<Partial<SalesGraphStateType>> {
    const { responseBody, inboundBody, intent, briefId, quoteDraftId } = state;

    // Run quality check on the conversation
    const qualityResult = this.conversationQualityCheckerService.checkQuality({
      userMessage: inboundBody || '',
      botResponse: responseBody || '',
      context: {
        intent: intent || 'unknown',
        confidence: 0.8, // Would be passed from intent classifier
        messageCount: state.transcript ? state.transcript.split('\n').length : 0,
        hasBrief: !!briefId,
        hasDraft: !!quoteDraftId,
        sameResponseCount: 0, // Would track from conversation history
      },
    });

    // Log quality check result
    this.logger.log({
      event: 'sales_graph_quality_check',
      conversationId: state.conversationId,
      isHealthy: qualityResult.isHealthy,
      issues: qualityResult.issues.length,
      shouldEscalate: qualityResult.shouldEscalate,
      recommendations: qualityResult.recommendations,
    });

    // If conversation is unhealthy and should escalate, notify human
    if (qualityResult.shouldEscalate) {
      this.logger.warn({
        event: 'sales_graph_quality_escalation',
        conversationId: state.conversationId,
        issues: qualityResult.issues,
        recommendations: qualityResult.recommendations,
      });

      return {
        shouldNotifyHuman: true,
        lastError: `Quality check escalation: ${qualityResult.issues.map((i) => i.description).join('; ')}`,
      };
    }

    return {};
  }

  // ---------------------------------------------------------------------------
  // Helpers (private)
  // ---------------------------------------------------------------------------

  private buildReadyForQuoteReply(brief: Partial<MergedBrief>, conversationId: string): string {
    const baseMessage = this.messageVariantService.getReadyForQuoteVariant(brief.projectType ?? null, {
      hasUrgency: !!brief.urgency,
      hasBudget: !!brief.budget,
      conversationId,
    });

    const budgetOpen =
      brief.budget === 'a definir con SN8' || brief.budget === 'presupuesto abierto';
    const exclusions =
      ' Como referencia comercial, no incluye hosting/infraestructura, consumo IA/LLM, mensajería ni licencias/integraciones de terceros.';
    const shouldRedirectToPhases = budgetOpen && looksLikeLargePlatformRequest(brief);

    const closing = shouldRedirectToPhases
      ? ' Para cuidar inversión y riesgo, arrancamos proponiendo MVP fase 1 y dejamos fase 2/3 en roadmap según resultados.' + exclusions
      : budgetOpen || brief.urgency === 'flexible'
        ? ' Si quieres ajustar algo del alcance o agregar detalles, aún estamos a tiempo.' + exclusions
        : ' Si se te ocurre algo más que quieras agregar, escríbeme antes de que cierre el brief.';

    return `${baseMessage}${closing}`;
  }
}
