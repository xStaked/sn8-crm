import { ConversationFlowService } from './conversation-flow.service';

describe('ConversationFlowService', () => {
  let prisma: {
    commercialBrief: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let conversationsService: { listConversationMessages: jest.Mock };
  let aiSalesService: { extractCommercialBrief: jest.Mock; generateDiscoveryReply: jest.Mock };
  let aiSalesOrchestrator: { enqueueQualifiedConversation: jest.Mock };
  let service: ConversationFlowService;

  beforeEach(() => {
    prisma = {
      commercialBrief: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    conversationsService = {
      listConversationMessages: jest.fn(),
    };
    aiSalesService = {
      extractCommercialBrief: jest.fn(),
      generateDiscoveryReply: jest.fn(),
    };
    aiSalesOrchestrator = {
      enqueueQualifiedConversation: jest.fn(),
    };

    service = new ConversationFlowService(
      prisma as any,
      conversationsService as any,
      aiSalesService as any,
      aiSalesOrchestrator as any,
    );
  });

  it('asks for the next missing discovery field instead of repeating the generic greeting', async () => {
    prisma.commercialBrief.findUnique.mockResolvedValue(null);
    conversationsService.listConversationMessages.mockResolvedValue([
      {
        id: 'msg_1',
        conversationId: '573001112233',
        direction: 'inbound',
        body: 'quiero cotizar un crm',
        createdAt: '2026-03-19T21:42:16.000Z',
      },
    ]);
    aiSalesService.extractCommercialBrief.mockResolvedValue({
      projectType: 'CRM',
      businessProblem: null,
      desiredScope: null,
      budget: null,
      urgency: null,
      constraints: null,
      summary: 'Cliente quiere cotizar un CRM.',
    });
    aiSalesService.generateDiscoveryReply.mockResolvedValue(
      'Buenísimo, un CRM. Cuéntame, cuál es el problema principal que quieres resolver con esto?',
    );

    const result = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_1',
      inboundBody: 'quiero cotizar un crm',
    });

    expect(prisma.commercialBrief.upsert).toHaveBeenCalledWith({
      where: { conversationId: '573001112233' },
      create: expect.objectContaining({
        conversationId: '573001112233',
        status: 'collecting',
        projectType: 'CRM',
      }),
      update: expect.objectContaining({
        status: 'collecting',
        projectType: 'CRM',
      }),
    });
    expect(aiSalesService.generateDiscoveryReply).toHaveBeenCalledWith(
      expect.objectContaining({
        missingField: 'businessProblem',
        isFirstTouch: true,
      }),
    );
    expect(result).toEqual({
      body: expect.any(String),
      source: 'commercial-discovery',
    });
    expect(aiSalesOrchestrator.enqueueQualifiedConversation).not.toHaveBeenCalled();
  });

  it('enqueues quote preparation when the brief is complete', async () => {
    prisma.commercialBrief.findUnique.mockResolvedValue({
      id: 'brief_1',
      conversationId: '573001112233',
      status: 'collecting',
      customerName: 'Sergio',
      projectType: 'CRM',
      businessProblem: null,
      desiredScope: null,
      budget: null,
      urgency: null,
      constraints: null,
      summary: null,
      sourceTranscript: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      quoteDrafts: [],
    });
    conversationsService.listConversationMessages.mockResolvedValue([
      {
        id: 'msg_1',
        conversationId: '573001112233',
        direction: 'inbound',
        body: 'quiero un crm para ventas con pipeline, automatizaciones, presupuesto de 4k a 6k y lanzarlo en 6 semanas',
        createdAt: '2026-03-19T21:42:16.000Z',
      },
    ]);
    aiSalesService.extractCommercialBrief.mockResolvedValue({
      customerName: 'Sergio',
      projectType: 'CRM',
      businessProblem: 'Centralizar el seguimiento comercial.',
      desiredScope: 'Pipeline, automatizaciones y panel de reportes.',
      budget: 'USD 4k a 6k',
      urgency: '6 semanas',
      constraints: 'Integracion con WhatsApp',
      summary: 'CRM comercial para equipo de ventas.',
    });

    const result = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_1',
      inboundBody:
        'quiero un crm para ventas con pipeline, automatizaciones, presupuesto de 4k a 6k y lanzarlo en 6 semanas',
    });

    expect(prisma.commercialBrief.upsert).toHaveBeenCalledWith({
      where: { conversationId: '573001112233' },
      create: expect.objectContaining({
        status: 'ready_for_quote',
      }),
      update: expect.objectContaining({
        status: 'ready_for_quote',
      }),
    });
    expect(aiSalesOrchestrator.enqueueQualifiedConversation).toHaveBeenCalledWith(
      '573001112233',
      'customer-message',
    );
    expect(result).toEqual({
      body: expect.stringContaining('Ya tengo lo minimo necesario'),
      source: 'commercial-ready-for-quote',
    });
  });

  it('returns review status when a draft already exists', async () => {
    prisma.commercialBrief.findUnique.mockResolvedValue({
      id: 'brief_1',
      conversationId: '573001112233',
      status: 'quote_in_review',
      customerName: 'Sergio',
      projectType: 'CRM',
      businessProblem: 'Centralizar ventas',
      desiredScope: 'Pipeline y reportes',
      budget: 'USD 5k',
      urgency: '1 mes',
      constraints: 'Integracion con WhatsApp',
      summary: 'CRM',
      sourceTranscript: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      quoteDrafts: [
        {
          id: 'draft_1',
          commercialBriefId: 'brief_1',
          conversationId: '573001112233',
          version: 1,
          origin: 'initial',
          reviewStatus: 'pending_owner_review',
          templateVersion: 'v1',
          draftPayload: {},
          renderedQuote: null,
          ownerFeedbackSummary: null,
          approvedAt: null,
          deliveredToCustomerAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    const result = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_1',
      inboundBody: 'como va mi propuesta?',
    });

    expect(result).toEqual({
      body: expect.stringContaining('revision interna'),
      source: 'commercial-review-status',
    });
    expect(conversationsService.listConversationMessages).not.toHaveBeenCalled();
    expect(aiSalesService.extractCommercialBrief).not.toHaveBeenCalled();
    expect(aiSalesOrchestrator.enqueueQualifiedConversation).not.toHaveBeenCalled();
  });
});
