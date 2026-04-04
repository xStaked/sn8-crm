import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

describe('ConversationsController', () => {
  let controller: ConversationsController;
  let service: {
    listConversations: jest.Mock;
    listConversationMessages: jest.Mock;
    getConversationQuoteReview: jest.Mock;
    getConversationQuoteReviewPdf: jest.Mock;
    approveConversationQuote: jest.Mock;
    requestConversationQuoteChanges: jest.Mock;
    applyOwnerAdjustments: jest.Mock;
  };

  beforeEach(() => {
    service = {
      listConversations: jest.fn(),
      listConversationMessages: jest.fn(),
      getConversationQuoteReview: jest.fn(),
      getConversationQuoteReviewPdf: jest.fn(),
      approveConversationQuote: jest.fn(),
      requestConversationQuoteChanges: jest.fn(),
      applyOwnerAdjustments: jest.fn(),
    };

    controller = new ConversationsController(
      service as unknown as ConversationsService,
    );
  });

  it('returns additive conversation summaries from the service', async () => {
    service.listConversations.mockResolvedValue([
      {
        id: '573001112233',
        contactName: '573001112233',
        lastMessage: 'te respondo',
        lastMessageAt: '2026-03-18T13:00:00.000Z',
        unreadCount: 0,
        pendingQuote: {
          conversationId: '573001112233',
          quoteDraftId: 'draft_2',
          version: 2,
          reviewStatus: 'ready_for_recheck',
        },
      },
    ]);

    await expect(controller.listConversations()).resolves.toEqual([
      {
        id: '573001112233',
        contactName: '573001112233',
        lastMessage: 'te respondo',
        lastMessageAt: '2026-03-18T13:00:00.000Z',
        unreadCount: 0,
        pendingQuote: {
          conversationId: '573001112233',
          quoteDraftId: 'draft_2',
          version: 2,
          reviewStatus: 'ready_for_recheck',
        },
      },
    ]);
    expect(service.listConversations).toHaveBeenCalledTimes(1);
  });

  it('delegates conversation history requests to the service', async () => {
    service.listConversationMessages.mockResolvedValue([
      {
        id: 'msg_1',
        conversationId: '573001112233',
        direction: 'inbound',
        body: 'hola',
        createdAt: '2026-03-18T12:00:00.000Z',
      },
    ]);

    await expect(
      controller.listConversationMessages('573001112233'),
    ).resolves.toEqual([
      {
        id: 'msg_1',
        conversationId: '573001112233',
        direction: 'inbound',
        body: 'hola',
        createdAt: '2026-03-18T12:00:00.000Z',
      },
    ]);
    expect(service.listConversationMessages).toHaveBeenCalledWith('573001112233');
  });

  it('delegates quote review lookups using the stable conversation id contract', async () => {
    service.getConversationQuoteReview.mockResolvedValue({
      conversationId: '573001112233',
      quoteDraftId: 'draft_2',
      version: 2,
      reviewStatus: 'ready_for_recheck',
      renderedQuote: 'Quote body',
      draftSummary: 'Executive summary',
      ownerFeedbackSummary: 'Adjust the milestones',
      approvedAt: null,
      deliveredToCustomerAt: null,
      commercialBrief: {
        customerName: 'ACME SAS',
        summary: 'Need a CRM',
        projectType: 'CRM',
        budget: 'USD 10k',
        urgency: 'High',
      },
      pdf: {
        available: false,
        fileName: null,
        generatedAt: null,
        sizeBytes: null,
        version: 2,
      },
    });

    await expect(
      controller.getConversationQuoteReview('573001112233'),
    ).resolves.toMatchObject({
      conversationId: '573001112233',
      quoteDraftId: 'draft_2',
      version: 2,
      reviewStatus: 'ready_for_recheck',
    });
    expect(service.getConversationQuoteReview).toHaveBeenCalledWith('573001112233');
  });

  it('delegates quote review pdf downloads and sets pdf headers', async () => {
    service.getConversationQuoteReviewPdf.mockResolvedValue({
      conversationId: '573001112233',
      quoteDraftId: 'draft_2',
      version: 2,
      fileName: 'cotizacion-sn8-v2.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 182304,
      generatedAt: '2026-04-01T19:00:00.000Z',
      content: Buffer.from('pdf bytes'),
    });
    const response = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await controller.downloadConversationQuoteReviewPdf(
      '573001112233',
      response as any,
    );

    expect(service.getConversationQuoteReviewPdf).toHaveBeenCalledWith('573001112233');
    expect(response.setHeader).toHaveBeenNthCalledWith(
      1,
      'Content-Type',
      'application/pdf',
    );
    expect(response.setHeader).toHaveBeenNthCalledWith(2, 'Content-Length', '182304');
    expect(response.setHeader).toHaveBeenNthCalledWith(
      3,
      'Content-Disposition',
      'inline; filename="cotizacion-sn8-v2.pdf"',
    );
    expect(response.send).toHaveBeenCalledWith(Buffer.from('pdf bytes'));
  });

  it('delegates quote approvals using the authenticated reviewer identity', async () => {
    service.approveConversationQuote.mockResolvedValue({
      conversationId: '573001112233',
      quoteDraftId: 'draft_2',
      version: 2,
      reviewStatus: 'delivered_to_customer',
      renderedQuote: 'Quote body',
      draftSummary: 'Executive summary',
      ownerFeedbackSummary: null,
      approvedAt: '2026-04-01T19:00:00.000Z',
      deliveredToCustomerAt: '2026-04-01T19:05:00.000Z',
      commercialBrief: {
        customerName: 'ACME SAS',
        summary: 'Need a CRM',
        projectType: 'CRM',
        budget: 'USD 10k',
        urgency: 'High',
      },
      pdf: {
        available: true,
        fileName: 'cotizacion-sn8-v2.pdf',
        generatedAt: '2026-04-01T18:58:00.000Z',
        sizeBytes: 182304,
        version: 2,
      },
    });

    await expect(
      controller.approveConversationQuote(
        '573001112233',
        { version: 2 },
        { user: { userId: 'user_1', email: 'socio@example.com' } } as any,
      ),
    ).resolves.toMatchObject({
      conversationId: '573001112233',
      deliveredToCustomerAt: '2026-04-01T19:05:00.000Z',
    });
    expect(service.approveConversationQuote).toHaveBeenCalledWith(
      '573001112233',
      { version: 2 },
      'socio@example.com',
    );
  });

  it('delegates request-changes actions using the authenticated reviewer identity', async () => {
    service.requestConversationQuoteChanges.mockResolvedValue({
      conversationId: '573001112233',
      quoteDraftId: 'draft_2',
      version: 2,
      reviewStatus: 'changes_requested',
      renderedQuote: 'Quote body',
      draftSummary: 'Executive summary',
      ownerFeedbackSummary: 'Ajusta hitos',
      approvedAt: null,
      deliveredToCustomerAt: null,
      commercialBrief: {
        customerName: 'ACME SAS',
        summary: 'Need a CRM',
        projectType: 'CRM',
        budget: 'USD 10k',
        urgency: 'High',
      },
      pdf: {
        available: false,
        fileName: null,
        generatedAt: null,
        sizeBytes: null,
        version: 2,
      },
    });

    await expect(
      controller.requestConversationQuoteChanges(
        '573001112233',
        { version: 2, feedback: 'Ajusta hitos' },
        { user: { userId: 'user_1', email: 'socio@example.com' } } as any,
      ),
    ).resolves.toMatchObject({
      conversationId: '573001112233',
      ownerFeedbackSummary: 'Ajusta hitos',
    });
    expect(service.requestConversationQuoteChanges).toHaveBeenCalledWith(
      '573001112233',
      { version: 2, feedback: 'Ajusta hitos' },
      'socio@example.com',
    );
  });

  it('delegates owner manual adjustments using the authenticated reviewer identity', async () => {
    service.applyOwnerAdjustments.mockResolvedValue({
      conversationId: '573001112233',
      quoteDraftId: 'draft_2',
      version: 2,
      reviewStatus: 'ready_for_recheck',
      renderedQuote: 'Quote body',
      draftSummary: 'Executive summary',
      ownerFeedbackSummary: null,
      approvedAt: null,
      deliveredToCustomerAt: null,
      commercialBrief: {
        customerName: 'ACME SAS',
        summary: 'Need a CRM',
        projectType: 'CRM',
        budget: 'USD 10k',
        urgency: 'High',
      },
      pdf: {
        available: false,
        fileName: null,
        generatedAt: null,
        sizeBytes: null,
        version: 2,
      },
      complexityScore: 65,
      confidence: 74,
      ruleVersionUsed: 9,
      estimatedMinAmount: 9500000,
      estimatedTargetAmount: 12500000,
      estimatedMaxAmount: 16000000,
      pricingBreakdown: { baseAmount: 8000000 },
      ownerAdjustments: [],
    });

    await expect(
      controller.applyOwnerAdjustments(
        '573001112233',
        {
          version: 2,
          estimatedMinAmount: 9500000,
          estimatedTargetAmount: 12500000,
          estimatedMaxAmount: 16000000,
          assumptions: ['Fase 1 sin ERP'],
          reason: 'Ajuste comercial',
        },
        { user: { userId: 'user_1', email: 'socio@example.com' } } as any,
      ),
    ).resolves.toMatchObject({
      conversationId: '573001112233',
      estimatedTargetAmount: 12500000,
    });
    expect(service.applyOwnerAdjustments).toHaveBeenCalledWith(
      '573001112233',
      {
        version: 2,
        estimatedMinAmount: 9500000,
        estimatedTargetAmount: 12500000,
        estimatedMaxAmount: 16000000,
        assumptions: ['Fase 1 sin ERP'],
        reason: 'Ajuste comercial',
      },
      'socio@example.com',
    );
  });
});
