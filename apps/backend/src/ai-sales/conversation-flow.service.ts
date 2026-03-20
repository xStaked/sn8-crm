import { Injectable, Logger } from '@nestjs/common';
import type { CommercialBrief, QuoteDraft } from '@prisma/client';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiSalesOrchestrator } from './ai-sales.orchestrator';
import { AiSalesService } from './ai-sales.service';

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

@Injectable()
export class ConversationFlowService {
  private readonly logger = new Logger(ConversationFlowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly aiSalesService: AiSalesService,
    private readonly aiSalesOrchestrator: AiSalesOrchestrator,
  ) {}

  async planReply(input: {
    conversationId: string;
    inboundMessageId: string;
    inboundBody: string | null;
  }): Promise<ReplyPlan> {
    const normalizedConversationId = input.conversationId.trim();
    const currentBrief = await this.prisma.commercialBrief.findUnique({
      where: { conversationId: normalizedConversationId },
      include: {
        quoteDrafts: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    const latestDraft = currentBrief?.quoteDrafts[0];
    if (latestDraft && latestDraft.reviewStatus !== 'delivered_to_customer') {
      return {
        body: this.buildReviewStatusReply(latestDraft.reviewStatus),
        source: 'commercial-review-status',
      };
    }

    try {
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

      await this.prisma.commercialBrief.upsert({
        where: { conversationId: normalizedConversationId },
        create: {
          conversationId: normalizedConversationId,
          status: missingFields.length > 0 ? 'collecting' : 'ready_for_quote',
          ...mergedBrief,
          sourceTranscript: messages,
        },
        update: {
          status: missingFields.length > 0 ? 'collecting' : 'ready_for_quote',
          ...mergedBrief,
          sourceTranscript: messages,
        },
      });

      if (missingFields.length > 0) {
        return {
          body: this.buildDiscoveryReply({
            missingField: missingFields[0],
            isFirstTouch: !currentBrief,
            projectType: mergedBrief.projectType,
          }),
          source: 'commercial-discovery',
        };
      }

      await this.aiSalesOrchestrator.enqueueQualifiedConversation(
        normalizedConversationId,
        'customer-message',
      );

      return {
        body:
          'Perfecto. Ya tengo lo minimo necesario para preparar tu cotizacion. Voy a consolidar el brief y dejar la propuesta en revision interna antes de compartirte el siguiente paso.',
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

  private buildDiscoveryReply(input: {
    missingField: RequiredBriefField;
    isFirstTouch: boolean;
    projectType: string | null;
  }): string {
    const intro = input.isFirstTouch
      ? 'Hola, soy el asistente comercial de SN8 Labs. Te voy a hacer unas preguntas cortas para entender bien tu proyecto antes de cotizar.'
      : 'Perfecto, sigo contigo.';

    const questionByField: Record<RequiredBriefField, string> = {
      projectType:
        'Para arrancar, que tipo de solucion quieres construir? Por ejemplo: CRM, app movil, ecommerce, automatizacion o dashboard interno.',
      businessProblem:
        'Cual es el problema principal que quieres resolver con esto? Entre mas concreto seas, mejor.',
      desiredScope: input.projectType
        ? `Que alcance esperas para ese ${input.projectType}? Dime lo minimo que debe incluir en la primera version.`
        : 'Que alcance esperas para la primera version? Dime las funciones clave que si o si necesitas.',
      budget:
        'Que rango de presupuesto tienes en mente para este proyecto? Si prefieres, puedes responder con un rango aproximado.',
      urgency:
        'Que tan urgente es? Tienes una fecha objetivo o una ventana estimada para arrancar o lanzar?',
      constraints:
        'Hay alguna restriccion importante que debamos considerar? Por ejemplo integraciones, tecnologia, equipo interno, compliance o tiempo.',
    };

    return `${intro} ${questionByField[input.missingField]}`;
  }

  private buildReviewStatusReply(reviewStatus: QuoteDraft['reviewStatus']): string {
    switch (reviewStatus) {
      case 'approved':
        return 'Tu propuesta ya fue aprobada internamente. Estamos preparando el siguiente paso para compartirla contigo por este mismo canal.';
      case 'changes_requested':
      case 'ready_for_recheck':
      case 'pending_owner_review':
      default:
        return 'Ya tenemos tu brief y la propuesta esta en revision interna. Si quieres, puedes seguir agregando contexto y lo tendremos en cuenta antes de cerrarla.';
    }
  }
}
