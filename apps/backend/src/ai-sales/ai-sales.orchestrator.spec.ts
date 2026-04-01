import { AiSalesOrchestrator } from './ai-sales.orchestrator';

describe('AiSalesOrchestrator', () => {
  let queue: { add: jest.Mock };
  let prisma: {
    commercialBrief: { findUnique: jest.Mock; upsert: jest.Mock };
    message: { create: jest.Mock };
  };
  let conversationsService: { listConversationMessages: jest.Mock };
  let messagingService: { sendText: jest.Mock };
  let config: { get: jest.Mock };
  let aiSalesService: {
    extractCommercialBrief: jest.Mock;
    createQuoteDraftFromTranscript: jest.Mock;
  };
  let ownerReviewService: { requestOwnerReview: jest.Mock };
  let orchestrator: AiSalesOrchestrator;

  beforeEach(() => {
    queue = { add: jest.fn() };
    prisma = {
      commercialBrief: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      message: {
        create: jest.fn(),
      },
    };
    conversationsService = {
      listConversationMessages: jest.fn(),
    };
    messagingService = {
      sendText: jest.fn(),
    };
    config = {
      get: jest.fn(),
    };
    aiSalesService = {
      extractCommercialBrief: jest.fn(),
      createQuoteDraftFromTranscript: jest.fn(),
    };
    ownerReviewService = {
      requestOwnerReview: jest.fn(),
    };

    orchestrator = new AiSalesOrchestrator(
      queue as any,
      prisma as any,
      conversationsService as any,
      messagingService as any,
      config as any,
      aiSalesService as any,
      ownerReviewService as any,
    );
  });

  it('preserves meaningful existing brief values when the extractor returns placeholders', async () => {
    prisma.commercialBrief.findUnique.mockResolvedValue({
      id: 'brief_1',
      conversationId: '573001112233',
      status: 'ready_for_quote',
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
        id: 'msg_1',
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
      desiredScope: 'Se requiere informacion adicional sobre alcance.',
      budget: 'No especificado',
      urgency: '1 mes',
      constraints: 'Uso interno para 2 personas.',
      summary: 'CRM interno con IA para leads.',
      missingInformation: ['alcance', 'presupuesto'],
    });
    prisma.commercialBrief.upsert.mockResolvedValue({
      id: 'brief_1',
      status: 'quote_in_review',
    });
    aiSalesService.createQuoteDraftFromTranscript.mockResolvedValue({
      id: 'draft_1',
      version: 1,
      reviewStatus: 'pending_owner_review',
    });
    ownerReviewService.requestOwnerReview.mockResolvedValue(undefined);
    messagingService.sendText.mockResolvedValue('out_1');
    prisma.message.create.mockResolvedValue({ id: 'msg_out_1' });

    const result = await orchestrator.processQualifiedConversation('573001112233');

    expect(prisma.commercialBrief.upsert).toHaveBeenCalledWith({
      where: { conversationId: '573001112233' },
      create: expect.objectContaining({
        status: 'quote_in_review',
        desiredScope: 'Conexion con WhatsApp y scoring inicial.',
        budget: '300 USD',
      }),
      update: expect.objectContaining({
        status: 'quote_in_review',
        desiredScope: 'Conexion con WhatsApp y scoring inicial.',
        budget: '300 USD',
      }),
    });
    expect(aiSalesService.createQuoteDraftFromTranscript).toHaveBeenCalledWith({
      conversationId: '573001112233',
      transcript: expect.stringContaining('realiza la cotizacion'),
      commercialBriefId: 'brief_1',
    });
    expect(ownerReviewService.requestOwnerReview).toHaveBeenCalledWith('draft_1');
    expect(messagingService.sendText).toHaveBeenCalledWith(
      '573001112233',
      expect.stringContaining('queda en revision interna con el socio'),
      undefined,
    );
    expect(result.processingStage).toBe('draft_ready_for_review');
  });

  it('returns a pending review draft state even when the owner notification path is optional', async () => {
    prisma.commercialBrief.findUnique.mockResolvedValue(null);
    conversationsService.listConversationMessages.mockResolvedValue([
      {
        id: 'msg_1',
        conversationId: '573204051366',
        direction: 'inbound',
        body: 'Necesito una cotizacion',
        createdAt: '2026-04-01T20:00:00.000Z',
      },
    ]);
    aiSalesService.extractCommercialBrief.mockResolvedValue({
      customerName: 'Cliente',
      projectType: 'CRM',
      businessProblem: 'Seguimiento comercial',
      desiredScope: 'Cotizacion inicial',
      budget: '1000 USD',
      urgency: 'Alta',
      constraints: 'Sin integraciones externas',
      summary: 'Listo para cotizar',
    });
    prisma.commercialBrief.upsert.mockResolvedValue({
      id: 'brief_2',
      status: 'quote_in_review',
    });
    aiSalesService.createQuoteDraftFromTranscript.mockResolvedValue({
      id: 'draft_optional_1',
      version: 1,
      reviewStatus: 'pending_owner_review',
    });
    ownerReviewService.requestOwnerReview.mockResolvedValue(undefined);
    messagingService.sendText.mockResolvedValue('out_2');
    prisma.message.create.mockResolvedValue({ id: 'msg_out_2' });

    const result = await orchestrator.processQualifiedConversation('573204051366');

    expect(aiSalesService.createQuoteDraftFromTranscript).toHaveBeenCalled();
    expect(ownerReviewService.requestOwnerReview).toHaveBeenCalledWith(
      'draft_optional_1',
    );
    expect(result).toMatchObject({
      conversationId: '573204051366',
      quoteDraftId: 'draft_optional_1',
      quoteDraftVersion: 1,
      quoteReviewStatus: 'pending_owner_review',
      processingStage: 'draft_ready_for_review',
    });
  });
});
