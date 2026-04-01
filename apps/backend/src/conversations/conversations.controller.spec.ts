import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

describe('ConversationsController', () => {
  let controller: ConversationsController;
  let service: {
    listConversations: jest.Mock;
    listConversationMessages: jest.Mock;
    getConversationQuoteReview: jest.Mock;
    approveConversationQuote: jest.Mock;
    requestConversationQuoteChanges: jest.Mock;
  };

  beforeEach(() => {
    service = {
      listConversations: jest.fn(),
      listConversationMessages: jest.fn(),
      getConversationQuoteReview: jest.fn(),
      approveConversationQuote: jest.fn(),
      requestConversationQuoteChanges: jest.fn(),
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
});
