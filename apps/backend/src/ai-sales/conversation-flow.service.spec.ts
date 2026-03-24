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
      missingInformation: ['Falta entender el problema principal del negocio.'],
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
      missingInformation: [],
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
      body: expect.stringContaining('voy a cotizar CRM'),
      source: 'commercial-ready-for-quote',
    });
    expect(result.body).toContain('Centralizar el seguimiento comercial.');
    expect(result.body).toContain('Pipeline, automatizaciones y panel de reportes.');
    expect(result.body).toContain('presupuesto USD 4k a 6k');
    expect(result.body).toContain('tiempo 6 semanas');
    expect(result.body).toContain('todavia puedes responder con mas detalle');
  });

  it('gives contextual next-step feedback when the brief is complete but no draft exists yet', async () => {
    prisma.commercialBrief.findUnique.mockResolvedValue({
      id: 'brief_1',
      conversationId: '573001112233',
      status: 'ready_for_quote',
      customerName: 'Sergio',
      projectType: 'una aplicacion para iOS',
      businessProblem: 'Vender y gestionar pedidos desde el celular.',
      desiredScope: 'Login, catalogo, carrito y notificaciones.',
      budget: 'USD 8k a 12k',
      urgency: '8 semanas',
      constraints: 'Debe salir primero en iPhone',
      summary: 'Aplicacion iOS comercial con compra y notificaciones.',
      sourceTranscript: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      quoteDrafts: [],
    });
    conversationsService.listConversationMessages.mockResolvedValue([
      {
        id: 'msg_2',
        conversationId: '573001112233',
        direction: 'inbound',
        body: 'y que vas a cotizar?',
        createdAt: '2026-03-23T16:34:01.000Z',
      },
    ]);
    aiSalesService.extractCommercialBrief.mockResolvedValue({
      customerName: 'Sergio',
      projectType: 'una aplicacion para iOS',
      businessProblem: 'Vender y gestionar pedidos desde el celular.',
      desiredScope: 'Login, catalogo, carrito y notificaciones.',
      budget: 'USD 8k a 12k',
      urgency: '8 semanas',
      constraints: 'Debe salir primero en iPhone',
      summary: 'Aplicacion iOS comercial con compra y notificaciones.',
      missingInformation: [],
    });

    const result = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_2',
      inboundBody: 'y que vas a cotizar?',
    });

    expect(result.source).toBe('commercial-ready-for-quote');
    expect(result.body).toContain('voy a cotizar una aplicacion para iOS');
    expect(result.body).toContain('Vender y gestionar pedidos desde el celular.');
    expect(result.body).toContain('Login, catalogo, carrito y notificaciones.');
    expect(result.body).toContain('presupuesto USD 8k a 12k');
    expect(result.body).toContain('tiempo 8 semanas');
    expect(result.body).toContain(
      'El siguiente paso es consolidar este brief y preparar una propuesta preliminar',
    );
    expect(result.body).toContain(
      'todavia puedes responder con mas detalle sobre alcance, presupuesto o prioridad',
    );
    expect(aiSalesOrchestrator.enqueueQualifiedConversation).toHaveBeenCalledWith(
      '573001112233',
      'customer-message',
    );
  });

  it('keeps the brief in discovery when the extractor summary contains placeholder missing-info language', async () => {
    prisma.commercialBrief.findUnique.mockResolvedValue({
      id: 'brief_1',
      conversationId: '573001112233',
      status: 'collecting',
      customerName: null,
      projectType: 'CRM',
      businessProblem: 'Calificar leads automaticamente.',
      desiredScope: 'MVP con WhatsApp e Instagram.',
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
        id: 'msg_3',
        conversationId: '573001112233',
        direction: 'inbound',
        body: 'lo necesito para dentro de 1 mes, lo necesito en modalidad mvp y poco mas. El presupuesto no importa',
        createdAt: '2026-03-23T16:52:23.000Z',
      },
    ]);
    aiSalesService.extractCommercialBrief.mockResolvedValue({
      customerName: null,
      projectType: 'CRM',
      businessProblem:
        'El cliente quiere un CRM con inteligencia artificial para calificar leads.',
      desiredScope: 'MVP con integraciones a WhatsApp e Instagram.',
      budget: 'El presupuesto no importa',
      urgency: '1 mes',
      constraints: 'Se requiere informacion adicional sobre restricciones.',
      summary:
        'El cliente ha expresado interés en desarrollar un sistema CRM. Se requiere información adicional sobre el nombre del cliente, presupuesto, urgencia y restricciones para estructurar un brief comercial completo.',
      missingInformation: ['nombre del cliente', 'restricciones clave'],
    });
    aiSalesService.generateDiscoveryReply.mockResolvedValue(
      'Perfecto, ya entendí el timing y que lo quieres como MVP. Para cerrar el brief, dime cómo prefieres que te llame y si hay alguna restricción clave que deba considerar.',
    );

    const result = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_3',
      inboundBody:
        'lo necesito para dentro de 1 mes, lo necesito en modalidad mvp y poco mas. El presupuesto no importa',
    });

    expect(prisma.commercialBrief.upsert).toHaveBeenCalledWith({
      where: { conversationId: '573001112233' },
      create: expect.objectContaining({
        status: 'collecting',
        budget: 'presupuesto abierto',
        urgency: '1 mes',
        constraints: null,
      }),
      update: expect.objectContaining({
        status: 'collecting',
        budget: 'presupuesto abierto',
        urgency: '1 mes',
        constraints: null,
      }),
    });
    expect(result).toEqual({
      body: expect.stringContaining('cómo prefieres que te llame'),
      source: 'commercial-discovery',
    });
    expect(aiSalesOrchestrator.enqueueQualifiedConversation).not.toHaveBeenCalled();
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
