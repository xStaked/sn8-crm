import { ConversationFlowService } from './conversation-flow.service';
import { MessageVariantService } from './message-variant.service';

describe('ConversationFlowService', () => {
  let prisma: {
    commercialBrief: { findUnique: jest.Mock; upsert: jest.Mock; delete: jest.Mock };
  };
  let conversationsService: { listConversationMessages: jest.Mock };
  let aiSalesService: { extractCommercialBrief: jest.Mock; generateDiscoveryReply: jest.Mock };
  let aiSalesOrchestrator: { enqueueQualifiedConversation: jest.Mock };
  let messageVariantService: MessageVariantService;
  let service: ConversationFlowService;

  beforeEach(() => {
    prisma = {
      commercialBrief: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
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
    messageVariantService = new MessageVariantService();

    service = new ConversationFlowService(
      prisma as any,
      conversationsService as any,
      aiSalesService as any,
      aiSalesOrchestrator as any,
      messageVariantService,
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
      body: expect.any(String),
      source: 'commercial-ready-for-quote',
    });
    // Message should contain project info
    expect(result.body).toContain('Centralizar');
    expect(result.body).toContain('6 semanas');
    expect(result.body).toContain('Centralizar el seguimiento comercial.');
    expect(result.body).toContain('Pipeline, automatizaciones y panel de reportes.');
    expect(result.body).toContain('presupuesto USD 4k a 6k');
    expect(result.body).toContain('tiempo 6 semanas');
    expect(result.body.toLowerCase()).toContain('todav');  // matches todavía/todavia
  });

  it('returns a processing message when the brief is already ready_for_quote and the user sends another message', async () => {
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

    const result = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_2',
      inboundBody: 'dame la cotizacion',
    });

    expect(result.source).toBe('commercial-review-status');
    // Response should indicate the brief is being processed (varied responses)
    expect(result.body.length).toBeGreaterThan(20);
    expect(result.body.toLowerCase()).toMatch(/propuesta|cotizaci|brief|preparaci|listo|revisi/);
    // Should re-enqueue in case the async job failed silently
    expect(aiSalesOrchestrator.enqueueQualifiedConversation).toHaveBeenCalledWith(
      '573001112233',
      'customer-message',
    );
    // Must NOT re-run extraction — that's the loop we fixed
    expect(aiSalesService.extractCommercialBrief).not.toHaveBeenCalled();
    expect(conversationsService.listConversationMessages).not.toHaveBeenCalled();
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

  it('does not ask again for a field already stored in the brief when missingInformation repeats it', async () => {
    prisma.commercialBrief.findUnique.mockResolvedValue({
      id: 'brief_1',
      conversationId: '573001112233',
      status: 'collecting',
      customerName: 'Sergio',
      projectType: 'CRM con IA',
      businessProblem: 'Calificar leads automaticamente.',
      desiredScope: 'Conexion con WhatsApp y scoring inicial.',
      budget: '300 USD',
      urgency: '1 mes',
      constraints: 'Uso interno para 2 personas.',
      summary: 'CRM interno con IA para leads.',
      sourceTranscript: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      quoteDrafts: [],
    });
    conversationsService.listConversationMessages.mockResolvedValue([
      {
        id: 'msg_4',
        conversationId: '573001112233',
        direction: 'inbound',
        body: 'realiza la cotizacion',
        createdAt: '2026-03-23T22:29:46.000Z',
      },
    ]);
    aiSalesService.extractCommercialBrief.mockResolvedValue({
      customerName: 'Sergio',
      projectType: 'CRM con IA',
      businessProblem: 'Calificar leads automaticamente.',
      desiredScope: 'Conexion con WhatsApp y scoring inicial.',
      budget: '300 USD',
      urgency: '1 mes',
      constraints: 'Uso interno para 2 personas.',
      summary: 'CRM interno con IA para leads.',
      missingInformation: ['presupuesto del proyecto'],
    });

    const result = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_4',
      inboundBody: 'realiza la cotizacion',
    });

    expect(prisma.commercialBrief.upsert).toHaveBeenCalledWith({
      where: { conversationId: '573001112233' },
      create: expect.objectContaining({
        status: 'ready_for_quote',
        budget: '300 USD',
      }),
      update: expect.objectContaining({
        status: 'ready_for_quote',
        budget: '300 USD',
      }),
    });
    expect(aiSalesService.generateDiscoveryReply).not.toHaveBeenCalled();
    expect(aiSalesOrchestrator.enqueueQualifiedConversation).toHaveBeenCalledWith(
      '573001112233',
      'customer-message',
    );
    expect(result.source).toBe('commercial-ready-for-quote');
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
      body: expect.any(String),
      source: 'commercial-review-status',
    });
    // Message should be about review status
    expect(result.body.length).toBeGreaterThan(10);
    expect(conversationsService.listConversationMessages).not.toHaveBeenCalled();
    expect(aiSalesService.extractCommercialBrief).not.toHaveBeenCalled();
    expect(aiSalesOrchestrator.enqueueQualifiedConversation).not.toHaveBeenCalled();
  });

  it('resets the previous brief when the customer explicitly asks to quote something else during review', async () => {
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
    conversationsService.listConversationMessages.mockResolvedValue([
      {
        id: 'msg_2',
        conversationId: '573001112233',
        direction: 'inbound',
        body: 'quiero cotizar otra cosa',
        createdAt: '2026-04-01T21:54:00.000Z',
      },
    ]);
    aiSalesService.extractCommercialBrief.mockResolvedValue({
      customerName: 'Sergio',
      projectType: null,
      businessProblem: null,
      desiredScope: null,
      budget: null,
      urgency: null,
      constraints: null,
      summary: null,
      missingInformation: ['tipo de proyecto'],
    });
    aiSalesService.generateDiscoveryReply.mockResolvedValue(
      'Perfecto. Dejamos aparte la cotizacion anterior. Que tipo de solucion quieres cotizar ahora?',
    );

    const result = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_2',
      inboundBody: 'quiero cotizar otra cosa',
    });

    expect(prisma.commercialBrief.delete).toHaveBeenCalledWith({
      where: { conversationId: '573001112233' },
    });
    expect(conversationsService.listConversationMessages).toHaveBeenCalledWith(
      '573001112233',
    );
    expect(aiSalesService.extractCommercialBrief).toHaveBeenCalled();
    expect(result).toEqual({
      body: expect.stringContaining('Que tipo de solucion quieres cotizar ahora'),
      source: 'commercial-discovery',
    });
  });

  it('persists newProjectStartMessageId and uses it for subsequent messages to avoid old context pollution', async () => {
    // First, simulate a new project being started
    prisma.commercialBrief.findUnique.mockResolvedValue({
      id: 'brief_2',
      conversationId: '573001112233',
      status: 'collecting',
      customerName: 'Sergio',
      projectType: 'app movil para veterinarias',
      businessProblem: 'Conectar veterinarios con dueños de mascotas',
      desiredScope: 'App tipo Laika con geolocalizacion',
      budget: null,
      urgency: null,
      constraints: null,
      summary: 'App movil para veterinarias tipo marketplace',
      sourceTranscript: null,
      conversationContext: { newProjectStartMessageId: 'msg_new_project' },
      createdAt: new Date(),
      updatedAt: new Date(),
      quoteDrafts: [],
    });
    
    // Simulate conversation history with old and new messages
    conversationsService.listConversationMessages.mockResolvedValue([
      // Old CRM project messages (should be filtered out)
      {
        id: 'msg_old_1',
        conversationId: '573001112233',
        direction: 'inbound',
        body: 'quiero un CRM con IA',
        createdAt: '2026-04-01T22:00:00.000Z',
      },
      {
        id: 'msg_old_2',
        conversationId: '573001112233',
        direction: 'outbound',
        body: 'Perfecto, un CRM',
        createdAt: '2026-04-01T22:01:00.000Z',
      },
      // New project start marker
      {
        id: 'msg_new_project',
        conversationId: '573001112233',
        direction: 'inbound',
        body: 'quiero cotizar otro proyecto, el CRM ya no me interesa',
        createdAt: '2026-04-01T23:11:52.000Z',
      },
      {
        id: 'msg_new_reply',
        conversationId: '573001112233',
        direction: 'outbound',
        body: 'Vale, entiendo que ahora quieres una app movil',
        createdAt: '2026-04-01T23:12:21.000Z',
      },
      // Current message asking about timeline
      {
        id: 'msg_current',
        conversationId: '573001112233',
        direction: 'inbound',
        body: 'no tiene urgencia, me gustaria saber cuanto se tardan',
        createdAt: '2026-04-01T23:13:07.000Z',
      },
    ]);
    
    aiSalesService.extractCommercialBrief.mockResolvedValue({
      customerName: 'Sergio',
      projectType: 'app movil para veterinarias',
      businessProblem: 'Conectar veterinarios con dueños de mascotas',
      desiredScope: 'App tipo Laika con geolocalizacion',
      budget: null,
      urgency: 'sin urgencia',
      constraints: null,
      summary: 'App movil marketplace para veterinarias',
      missingInformation: ['presupuesto'],
    });
    aiSalesService.generateDiscoveryReply.mockResolvedValue(
      'Ok, sin urgencia. Sobre el presupuesto, que rango manejas?',
    );

    const result = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_current',
      inboundBody: 'no tiene urgencia, me gustaria saber cuanto se tardan',
    });

    // Verify that extraction was called with filtered messages (only from msg_new_project onwards)
    const extractionCall = aiSalesService.extractCommercialBrief.mock.calls[0];
    const transcript = extractionCall[1]; // second argument is the transcript
    
    // The transcript should NOT contain the old CRM messages
    expect(transcript).not.toContain('CRM con IA');
    expect(transcript).not.toContain('quiero un CRM');
    
    // The transcript SHOULD contain the new project messages (from msg_new_project onwards)
    expect(transcript).toContain('quiero cotizar otro proyecto');
    expect(transcript).toContain('CRM ya no me interesa');
    expect(transcript).toContain('no tiene urgencia');

    expect(result.source).toBe('commercial-discovery');
  });

  it('detects user confusion and provides clarification instead of repeating the same message', async () => {
    prisma.commercialBrief.findUnique.mockResolvedValue({
      id: 'brief_1',
      conversationId: '573001112233',
      status: 'ready_for_quote',
      customerName: 'Sergio',
      projectType: 'CRM con IA',
      businessProblem: 'Calificar leads automaticamente',
      desiredScope: 'Conexion con WhatsApp y scoring',
      budget: '300 USD',
      urgency: '1 mes',
      constraints: 'Uso interno para 2 personas',
      summary: 'CRM interno con IA',
      sourceTranscript: null,
      conversationContext: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      quoteDrafts: [],
    });

    const result = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_confused',
      inboundBody: 'informacion de que proyecto?',
    });

    expect(result.source).toBe('commercial-clarification');
    expect(result.body).toContain('CRM con IA');
    expect(result.body).toContain('confusión');
    expect(result.body.toLowerCase()).toMatch(/prefieres|diferente|continuar/);
    // Should NOT be the generic "Ya tenemos tu información completa" message
    expect(result.body).not.toContain('Ya tenemos tu información completa');
  });

  it('provides varied responses when brief is ready_for_quote and user sends different messages', async () => {
    prisma.commercialBrief.findUnique.mockResolvedValue({
      id: 'brief_1',
      conversationId: '573001112233',
      status: 'ready_for_quote',
      customerName: 'Sergio',
      projectType: 'App móvil',
      businessProblem: 'Conectar veterinarios',
      desiredScope: 'MVP con geolocalización',
      budget: 'USD 8k',
      urgency: '2 meses',
      constraints: null,
      summary: 'App para veterinarias',
      sourceTranscript: null,
      conversationContext: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      quoteDrafts: [],
    });

    // First follow-up
    const result1 = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_1',
      inboundBody: 'ok gracias',
    });
    expect(result1.source).toBe('commercial-review-status');

    // Second follow-up - should be different
    const result2 = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_2',
      inboundBody: 'cuanto falta?',
    });
    expect(result2.source).toBe('commercial-review-status');
    
    // Both should mention the project but be different
    expect(result1.body).not.toBe(result2.body);
  });

  it('detects "como asi" and similar phrases as confusion and provides clarification', async () => {
    prisma.commercialBrief.findUnique.mockResolvedValue({
      id: 'brief_1',
      conversationId: '573001112233',
      status: 'ready_for_quote',
      customerName: 'Sergio',
      projectType: 'CRM con IA',
      businessProblem: 'Calificar leads automaticamente',
      desiredScope: 'Conexion con WhatsApp y scoring',
      budget: '300 USD',
      urgency: '1 mes',
      constraints: 'Uso interno para 2 personas',
      summary: 'CRM interno con IA',
      sourceTranscript: null,
      conversationContext: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      quoteDrafts: [],
    });

    const result = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_confused',
      inboundBody: 'como asi que estas cotizando?',
    });

    expect(result.source).toBe('commercial-clarification');
    expect(result.body).toContain('CRM con IA');
    expect(result.body.toLowerCase()).toMatch(/confusi[oó]n|entender/);
    expect(result.body.toLowerCase()).toMatch(/prefieres|diferente|empezamos de cero/);
  });

  it('detects confusion when user asks "que tiene que ver" and provides clarification', async () => {
    prisma.commercialBrief.findUnique.mockResolvedValue({
      id: 'brief_1',
      conversationId: '573001112233',
      status: 'ready_for_quote',
      customerName: 'Sergio',
      projectType: 'CRM con IA',
      businessProblem: 'Calificar leads',
      desiredScope: 'MVP',
      budget: '300 USD',
      urgency: '1 mes',
      constraints: null,
      summary: 'CRM',
      sourceTranscript: null,
      conversationContext: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      quoteDrafts: [],
    });

    const result = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_confused2',
      inboundBody: 'y eso que tiene que ver con mi proyecto de aplicacion movil?',
    });

    expect(result.source).toBe('commercial-clarification');
    expect(result.body).toContain('CRM');
  });

  it('resets brief when user wants new project even if a draft already exists', async () => {
    prisma.commercialBrief.findUnique.mockResolvedValue({
      id: 'brief_1',
      conversationId: '573001112233',
      status: 'quote_in_review',
      customerName: 'Sergio',
      projectType: 'CRM con IA',
      businessProblem: 'Calificar leads',
      desiredScope: 'MVP',
      budget: '300 USD',
      urgency: '1 mes',
      constraints: null,
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
    conversationsService.listConversationMessages.mockResolvedValue([
      {
        id: 'msg_new',
        conversationId: '573001112233',
        direction: 'inbound',
        body: 'quiero cotizar otro proyecto, una app movil',
        createdAt: '2026-04-01T23:30:00.000Z',
      },
    ]);
    aiSalesService.extractCommercialBrief.mockResolvedValue({
      customerName: 'Sergio',
      projectType: 'app móvil',
      businessProblem: null,
      desiredScope: null,
      budget: null,
      urgency: null,
      constraints: null,
      summary: 'App móvil',
      missingInformation: ['problema principal'],
    });
    aiSalesService.generateDiscoveryReply.mockResolvedValue(
      'Perfecto, una app móvil. Cuéntame qué problema quieres resolver.',
    );

    const result = await service.planReply({
      conversationId: '573001112233',
      inboundMessageId: 'msg_new',
      inboundBody: 'quiero cotizar otro proyecto, una app movil',
    });

    expect(prisma.commercialBrief.delete).toHaveBeenCalledWith({
      where: { conversationId: '573001112233' },
    });
    expect(aiSalesService.extractCommercialBrief).toHaveBeenCalled();
    expect(result.source).toBe('commercial-discovery');
    expect(result.body).toContain('app móvil');
  });

  it('provides clarification message when user is confused and there is an existing draft', async () => {
    prisma.commercialBrief.findUnique.mockResolvedValue({
      id: 'brief_1',
      conversationId: '573001112233',
      status: 'quote_in_review',
      customerName: 'Sergio',
      projectType: 'CRM con IA',
      businessProblem: 'Calificar leads',
      desiredScope: 'MVP',
      budget: '300 USD',
      urgency: '1 mes',
      constraints: null,
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
      inboundMessageId: 'msg_confused',
      inboundBody: 'no entiendo de que hablas',
    });

    expect(result.source).toBe('commercial-clarification');
    expect(result.body).toContain('CRM');
    expect(result.body.toLowerCase()).toMatch(/confusi[oó]n|entender/);
    expect(result.body.toLowerCase()).toMatch(/empezamos de cero|diferente/);
  });
});
