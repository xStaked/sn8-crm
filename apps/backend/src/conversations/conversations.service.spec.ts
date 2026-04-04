import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OwnerReviewService } from '../ai-sales/owner-review.service';
import { BotConversationRepository } from '../bot-conversation/bot-conversation.repository';
import { MessagingService } from '../messaging/messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuotePdfService } from '../quote-documents/quote-pdf.service';
import { ConversationsService } from './conversations.service';

describe('ConversationsService', () => {
  let prisma: {
    message: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    quoteDraft: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    quoteEstimateSnapshot: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    quoteReviewEvent: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let messagingService: { sendText: jest.Mock };
  let botConversationRepository: {
    loadState: jest.Mock;
    rebuildState: jest.Mock;
    saveState: jest.Mock;
  };
  let config: { get: jest.Mock };
  let ownerReviewService: {
    approveDraftFromCrm: jest.Mock;
    requestChangesFromCrm: jest.Mock;
  };
  let quotePdfService: { getOrCreateDraftPdf: jest.Mock };
  let service: ConversationsService;
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      message: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      quoteDraft: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      quoteEstimateSnapshot: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      quoteReviewEvent: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    messagingService = {
      sendText: jest.fn(),
    };

    botConversationRepository = {
      loadState: jest.fn(),
      rebuildState: jest.fn(),
      saveState: jest.fn(),
    };

    config = {
      get: jest.fn(),
    };

    ownerReviewService = {
      approveDraftFromCrm: jest.fn(),
      requestChangesFromCrm: jest.fn(),
    };

    quotePdfService = {
      getOrCreateDraftPdf: jest.fn(),
    };

    service = new ConversationsService(
      prisma as unknown as PrismaService,
      messagingService as unknown as MessagingService,
      config as unknown as ConfigService,
      ownerReviewService as unknown as OwnerReviewService,
      quotePdfService as unknown as QuotePdfService,
      undefined as any,
      botConversationRepository as unknown as BotConversationRepository,
    );

    loggerLogSpy = jest
      .spyOn(service['logger'] as any, 'log')
      .mockImplementation(() => undefined);
    loggerWarnSpy = jest
      .spyOn(service['logger'] as any, 'warn')
      .mockImplementation(() => undefined);
  });

  it('groups multiple inbound messages from the same phone into one summary', async () => {
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'msg_new',
        direction: 'inbound',
        fromPhone: ' 573001112233 ',
        toPhone: '573009998877',
        body: 'seguimiento',
        createdAt: new Date('2026-03-18T12:00:00.000Z'),
      },
      {
        id: 'msg_old',
        direction: 'inbound',
        fromPhone: ' 573001112233 ',
        toPhone: '573009998877',
        body: 'hola',
        createdAt: new Date('2026-03-18T10:00:00.000Z'),
      },
    ]);
    prisma.quoteDraft.findMany.mockResolvedValue([]);

    await expect(service.listConversations()).resolves.toEqual([
      {
        id: '573001112233',
        contactName: '573001112233',
        lastMessage: 'seguimiento',
        lastMessageAt: '2026-03-18T12:00:00.000Z',
        unreadCount: 0,
        pendingQuote: null,
        conversationControl: {
          state: 'QUALIFYING',
          control: 'ai_control',
          updatedAt: '2026-03-18T12:00:00.000Z',
          updatedBy: 'system',
        },
      },
    ]);
  });

  it('uses the same stable conversation id for inbound and outbound traffic with the same participant', async () => {
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'msg_outbound',
        direction: 'outbound',
        fromPhone: '573009998877',
        toPhone: '573001112233',
        body: 'te respondo',
        createdAt: new Date('2026-03-18T13:00:00.000Z'),
      },
      {
        id: 'msg_inbound',
        direction: 'inbound',
        fromPhone: '573001112233',
        toPhone: '573009998877',
        body: 'hola',
        createdAt: new Date('2026-03-18T12:00:00.000Z'),
      },
    ]);
    prisma.quoteDraft.findMany.mockResolvedValue([]);

    const conversations = await service.listConversations();

    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      id: '573001112233',
      contactName: '573001112233',
      lastMessage: 'te respondo',
      unreadCount: 0,
      pendingQuote: null,
    });
  });

  it('returns chronological history for the same stable conversation id used in summaries', async () => {
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'msg_inbound',
        direction: 'inbound',
        fromPhone: ' 573001112233 ',
        toPhone: '573009998877',
        body: 'hola',
        createdAt: new Date('2026-03-18T12:00:00.000Z'),
      },
      {
        id: 'msg_outbound',
        direction: 'outbound',
        fromPhone: '573009998877',
        toPhone: '573001112233',
        body: 'te respondo',
        createdAt: new Date('2026-03-18T13:00:00.000Z'),
      },
      {
        id: 'msg_other',
        direction: 'inbound',
        fromPhone: '573004445566',
        toPhone: '573009998877',
        body: 'otra conversación',
        createdAt: new Date('2026-03-18T11:00:00.000Z'),
      },
    ]);
    prisma.quoteDraft.findMany.mockResolvedValue([]);

    const [summary] = await service.listConversations();
    const history = await service.listConversationMessages(` ${summary.id} `);

    expect(summary.id).toBe('573001112233');
    expect(history).toEqual([
      {
        id: 'msg_inbound',
        conversationId: '573001112233',
        direction: 'inbound',
        body: 'hola',
        createdAt: '2026-03-18T12:00:00.000Z',
      },
      {
        id: 'msg_outbound',
        conversationId: '573001112233',
        direction: 'outbound',
        body: 'te respondo',
        createdAt: '2026-03-18T13:00:00.000Z',
      },
    ]);
  });

  it('uses the inbound raw payload phone_number_id when sending a reply', async () => {
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'msg_outbound',
        direction: 'outbound',
        fromPhone: 'pnid_fallback',
        toPhone: '573001112233',
        body: 'te respondo',
        createdAt: new Date('2026-03-18T13:00:00.000Z'),
        rawPayload: { source: 'crm-manual-reply' },
      },
      {
        id: 'msg_inbound',
        direction: 'inbound',
        fromPhone: '573001112233',
        toPhone: '573009998877',
        body: 'hola',
        createdAt: new Date('2026-03-18T12:00:00.000Z'),
        rawPayload: {
          entry: [
            {
              changes: [
                {
                  value: {
                    metadata: {
                      phone_number_id: 'phone_number_id_123',
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    ]);
    messagingService.sendText.mockResolvedValue('wamid.outbound.123');
    prisma.message.create.mockResolvedValue({
      id: 'db_1',
      direction: 'outbound',
      body: 'respuesta',
      createdAt: new Date('2026-03-18T14:00:00.000Z'),
    });

    const response = await service.sendMessage('573001112233', ' respuesta ');

    expect(messagingService.sendText).toHaveBeenCalledWith(
      '573001112233',
      'respuesta',
      'phone_number_id_123',
    );
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalMessageId: 'wamid.outbound.123',
        fromPhone: 'phone_number_id_123',
        toPhone: '573001112233',
        body: 'respuesta',
      }),
      select: {
        id: true,
        direction: true,
        body: true,
        createdAt: true,
      },
    });
    expect(response).toEqual({
      id: 'db_1',
      conversationId: '573001112233',
      direction: 'outbound',
      body: 'respuesta',
      createdAt: '2026-03-18T14:00:00.000Z',
    });
  });

  it('uses the Kapso batch data phone_number_id when the inbound raw payload is stored as data[]', async () => {
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'msg_inbound_batch',
        direction: 'inbound',
        fromPhone: '573015871054',
        toPhone: '1084934881360304',
        body: 'Oe bro',
        createdAt: new Date('2026-03-19T04:12:16.214Z'),
        rawPayload: {
          data: [
            {
              message: {
                id: 'wamid.batch.1',
                from: '573015871054',
              },
              conversation: {
                id: 'conv_1',
                phone_number_id: '597907523413541',
              },
              phone_number_id: '597907523413541',
            },
          ],
          type: 'whatsapp.message.received',
          batch: true,
        },
      },
    ]);
    messagingService.sendText.mockResolvedValue('wamid.outbound.batch');
    prisma.message.create.mockResolvedValue({
      id: 'db_batch',
      direction: 'outbound',
      body: 'estoy vivo',
      createdAt: new Date('2026-03-19T04:13:00.000Z'),
    });

    await service.sendMessage('573015871054', 'estoy vivo');

    expect(messagingService.sendText).toHaveBeenCalledWith(
      '573015871054',
      'estoy vivo',
      '597907523413541',
    );
  });

  it('falls back to KAPSO_PHONE_NUMBER_ID when the conversation has no stored phone_number_id', async () => {
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'msg_inbound',
        direction: 'inbound',
        fromPhone: '573001112233',
        toPhone: '573009998877',
        body: 'hola',
        createdAt: new Date('2026-03-18T12:00:00.000Z'),
        rawPayload: { fixture: 'no_phone_number_id' },
      },
    ]);
    messagingService.sendText.mockResolvedValue('wamid.outbound.456');
    prisma.message.create.mockResolvedValue({
      id: 'db_2',
      direction: 'outbound',
      body: 'respuesta fallback',
      createdAt: new Date('2026-03-18T14:05:00.000Z'),
    });
    config.get.mockReturnValue('configured_phone_number_id');

    await service.sendMessage('573001112233', 'respuesta fallback');

    expect(messagingService.sendText).toHaveBeenCalledWith(
      '573001112233',
      'respuesta fallback',
      'configured_phone_number_id',
    );
  });

  it('adds pending quote metadata without changing the conversation id contract', async () => {
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'msg_inbound',
        direction: 'inbound',
        fromPhone: '573001112233',
        toPhone: '573009998877',
        body: 'hola',
        createdAt: new Date('2026-03-18T12:00:00.000Z'),
      },
    ]);
    prisma.quoteDraft.findMany.mockResolvedValue([
      {
        id: 'draft_2',
        conversationId: '573001112233',
        version: 2,
        reviewStatus: 'ready_for_recheck',
      },
    ]);

    await expect(service.listConversations()).resolves.toEqual([
      {
        id: '573001112233',
        contactName: '573001112233',
        lastMessage: 'hola',
        lastMessageAt: '2026-03-18T12:00:00.000Z',
        unreadCount: 0,
        pendingQuote: {
          conversationId: '573001112233',
          quoteDraftId: 'draft_2',
          version: 2,
          reviewStatus: 'ready_for_recheck',
        },
        conversationControl: {
          state: 'QUALIFYING',
          control: 'ai_control',
          updatedAt: '2026-03-18T12:00:00.000Z',
          updatedBy: 'system',
        },
      },
    ]);
  });

  it('returns the latest review-ready quote preview for a conversation', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg_inbound',
      direction: 'inbound',
      fromPhone: '573001112233',
      toPhone: '573009998877',
    });
    prisma.quoteDraft.findFirst.mockResolvedValue({
      id: 'draft_3',
      conversationId: '573001112233',
      version: 3,
      pricingRuleVersion: 7,
      reviewStatus: 'approved',
      renderedQuote: 'Quote body',
      draftPayload: { summary: 'Executive summary' },
      ownerFeedbackSummary: 'Update the milestones',
      approvedAt: new Date('2026-04-01T19:00:00.000Z'),
      deliveredToCustomerAt: new Date('2026-04-01T19:05:00.000Z'),
      document: {
        fileName: 'cotizacion-sn8-v3.pdf',
        sizeBytes: 182304,
        generatedAt: new Date('2026-04-01T18:58:00.000Z'),
      },
      commercialBrief: {
        customerName: 'ACME SAS',
        summary: 'Need a CRM',
        projectType: 'CRM',
        budget: 'USD 10k',
        urgency: 'High',
      },
      pricingRule: {
        id: 'rule_7',
        category: 'crm',
        complexity: 'medium',
        integrationType: 'erp',
      },
    });
    prisma.quoteEstimateSnapshot.findFirst.mockResolvedValue({
      complexityScore: 67.5,
      confidencePct: 74,
      estimatedMinAmount: 9500000,
      estimatedTargetAmount: 12000000,
      estimatedMaxAmount: 14500000,
      breakdown: {
        baseAmount: 8000000,
        complexityAmount: 1350000,
      },
      inputPayload: {
        source: 'deterministic_quote_estimator',
        ruleVersionUsed: 7,
      },
    });

    await expect(service.getConversationQuoteReview(' 573001112233 ')).resolves.toEqual({
      conversationId: '573001112233',
      quoteDraftId: 'draft_3',
      version: 3,
      reviewStatus: 'approved',
      renderedQuote: 'Quote body',
      draftSummary: 'Executive summary',
      ownerFeedbackSummary: 'Update the milestones',
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
        fileName: 'cotizacion-sn8-v3.pdf',
        generatedAt: '2026-04-01T18:58:00.000Z',
        sizeBytes: 182304,
        version: 3,
      },
      pricingRule: {
        id: 'rule_7',
        version: 7,
        category: 'crm',
        complexity: 'medium',
        integrationType: 'erp',
      },
      complexityScore: 67.5,
      confidence: 74,
      ruleVersionUsed: 7,
      estimatedMinAmount: 9500000,
      estimatedTargetAmount: 12000000,
      estimatedMaxAmount: 14500000,
      pricingBreakdown: {
        baseAmount: 8000000,
        complexityAmount: 1350000,
      },
      ownerAdjustments: [],
    });
  });

  it('returns unavailable pdf metadata when the review draft has no stored document', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg_inbound',
      direction: 'inbound',
      fromPhone: '573001112233',
      toPhone: '573009998877',
    });
    prisma.quoteDraft.findFirst.mockResolvedValue({
      id: 'draft_4',
      conversationId: '573001112233',
      version: 4,
      pricingRuleVersion: null,
      reviewStatus: 'ready_for_recheck',
      renderedQuote: 'Quote body',
      draftPayload: { summary: 'Executive summary' },
      ownerFeedbackSummary: null,
      approvedAt: null,
      deliveredToCustomerAt: null,
      document: null,
      commercialBrief: {
        customerName: 'ACME SAS',
        summary: 'Need a CRM',
        projectType: 'CRM',
        budget: 'USD 10k',
        urgency: 'High',
      },
      pricingRule: null,
    });

    await expect(service.getConversationQuoteReview('573001112233')).resolves.toMatchObject({
      quoteDraftId: 'draft_4',
      pdf: {
        available: false,
        fileName: null,
        generatedAt: null,
        sizeBytes: null,
        version: 4,
      },
      pricingRule: {
        id: null,
        version: null,
      },
    });
  });

  it('retrieves the pdf for the latest review-relevant draft version', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg_inbound',
      direction: 'inbound',
      fromPhone: '573001112233',
      toPhone: '573009998877',
    });
    prisma.quoteDraft.findFirst.mockResolvedValue({
      id: 'draft_5',
      conversationId: '573001112233',
      version: 5,
      pricingRuleVersion: null,
      reviewStatus: 'approved',
      renderedQuote: 'Quote body',
      draftPayload: { summary: 'Executive summary' },
      ownerFeedbackSummary: null,
      approvedAt: new Date('2026-04-01T19:00:00.000Z'),
      deliveredToCustomerAt: null,
      document: null,
      commercialBrief: {
        customerName: 'ACME SAS',
        summary: 'Need a CRM',
        projectType: 'CRM',
        budget: 'USD 10k',
        urgency: 'High',
      },
      pricingRule: null,
    });
    quotePdfService.getOrCreateDraftPdf.mockResolvedValue({
      fileName: 'cotizacion-sn8-v5.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 190000,
      generatedAt: new Date('2026-04-01T19:10:00.000Z'),
      content: Buffer.from('pdf bytes'),
    });

    await expect(service.getConversationQuoteReviewPdf(' 573001112233 ')).resolves.toEqual({
      conversationId: '573001112233',
      quoteDraftId: 'draft_5',
      version: 5,
      fileName: 'cotizacion-sn8-v5.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 190000,
      generatedAt: '2026-04-01T19:10:00.000Z',
      content: Buffer.from('pdf bytes'),
    });

    expect(prisma.quoteDraft.findFirst).toHaveBeenCalledWith({
      where: {
        conversationId: '573001112233',
        reviewStatus: {
          in: [
            'pending_owner_review',
            'ready_for_recheck',
            'changes_requested',
            'approved',
            'delivered_to_customer',
          ],
        },
      },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
      include: {
        commercialBrief: {
          select: {
            customerName: true,
            summary: true,
            projectType: true,
            budget: true,
            urgency: true,
          },
        },
        document: {
          select: {
            fileName: true,
            sizeBytes: true,
            generatedAt: true,
          },
        },
        pricingRule: {
          select: {
            id: true,
            category: true,
            complexity: true,
            integrationType: true,
          },
        },
      },
    });
    expect(quotePdfService.getOrCreateDraftPdf).toHaveBeenCalledWith('draft_5');
  });

  it('throws when the conversation exists but has no review draft', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg_inbound',
      direction: 'inbound',
      fromPhone: '573001112233',
      toPhone: '573009998877',
    });
    prisma.quoteDraft.findFirst.mockResolvedValue(null);

    await expect(service.getConversationQuoteReview('573001112233')).rejects.toThrow(
      new NotFoundException('Conversation 573001112233 has no quote review draft.'),
    );
  });

  it('delegates CRM quote approvals through OwnerReviewService and returns refreshed detail', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg_inbound',
      direction: 'inbound',
      fromPhone: '573001112233',
      toPhone: '573009998877',
    });
    prisma.quoteDraft.findFirst.mockResolvedValue({
      id: 'draft_3',
      conversationId: '573001112233',
      version: 3,
      pricingRuleVersion: null,
      reviewStatus: 'delivered_to_customer',
      renderedQuote: 'Quote body',
      draftPayload: { summary: 'Executive summary' },
      ownerFeedbackSummary: null,
      approvedAt: new Date('2026-04-01T19:00:00.000Z'),
      deliveredToCustomerAt: new Date('2026-04-01T19:05:00.000Z'),
      document: null,
      commercialBrief: {
        customerName: 'ACME SAS',
        summary: 'Need a CRM',
        projectType: 'CRM',
        budget: 'USD 10k',
        urgency: 'High',
      },
      pricingRule: null,
    });

    const response = await service.approveConversationQuote(
      ' 573001112233 ',
      { version: 3 },
      'socio@example.com',
    );

    expect(ownerReviewService.approveDraftFromCrm).toHaveBeenCalledWith({
      action: 'approve',
      conversationId: '573001112233',
      version: 3,
      reviewerPhone: 'socio@example.com',
    });
    expect(response).toMatchObject({
      conversationId: '573001112233',
      reviewStatus: 'delivered_to_customer',
      deliveredToCustomerAt: '2026-04-01T19:05:00.000Z',
    });
  });

  it('delegates CRM change requests through OwnerReviewService and trims feedback', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg_inbound',
      direction: 'inbound',
      fromPhone: '573001112233',
      toPhone: '573009998877',
    });
    prisma.quoteDraft.findFirst.mockResolvedValue({
      id: 'draft_3',
      conversationId: '573001112233',
      version: 3,
      pricingRuleVersion: null,
      reviewStatus: 'changes_requested',
      renderedQuote: 'Quote body',
      draftPayload: { summary: 'Executive summary' },
      ownerFeedbackSummary: 'Ajusta hitos',
      approvedAt: null,
      deliveredToCustomerAt: null,
      document: null,
      commercialBrief: {
        customerName: 'ACME SAS',
        summary: 'Need a CRM',
        projectType: 'CRM',
        budget: 'USD 10k',
        urgency: 'High',
      },
      pricingRule: null,
    });

    const response = await service.requestConversationQuoteChanges(
      '573001112233',
      { version: 3, feedback: '  Ajusta hitos  ' },
      'socio@example.com',
    );

    expect(ownerReviewService.requestChangesFromCrm).toHaveBeenCalledWith({
      action: 'revise',
      conversationId: '573001112233',
      version: 3,
      reviewerPhone: 'socio@example.com',
      feedback: 'Ajusta hitos',
    });
    expect(response).toMatchObject({
      conversationId: '573001112233',
      reviewStatus: 'changes_requested',
      ownerFeedbackSummary: 'Ajusta hitos',
    });
  });

  it('applies owner manual adjustments and stores audit metadata for the active draft', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg_inbound',
      direction: 'inbound',
      fromPhone: '573001112233',
      toPhone: '573009998877',
    });
    prisma.quoteDraft.findFirst
      .mockResolvedValueOnce({
        id: 'draft_9',
        conversationId: '573001112233',
        version: 9,
        pricingRuleId: 'rule_9',
        pricingRuleVersion: 9,
        reviewStatus: 'pending_owner_review',
        renderedQuote: 'Quote body',
        draftPayload: { summary: 'Executive summary' },
        ownerFeedbackSummary: null,
        approvedAt: null,
        deliveredToCustomerAt: null,
        document: null,
        commercialBrief: {
          customerName: 'ACME SAS',
          summary: 'Need a CRM',
          projectType: 'CRM',
          budget: 'USD 10k',
          urgency: 'High',
        },
        pricingRule: null,
      })
      .mockResolvedValueOnce({
        id: 'draft_9',
        conversationId: '573001112233',
        version: 9,
        pricingRuleId: 'rule_9',
        pricingRuleVersion: 9,
        reviewStatus: 'ready_for_recheck',
        renderedQuote: 'Quote body',
        draftPayload: { summary: 'Executive summary' },
        ownerFeedbackSummary: null,
        approvedAt: null,
        deliveredToCustomerAt: null,
        document: null,
        commercialBrief: {
          customerName: 'ACME SAS',
          summary: 'Need a CRM',
          projectType: 'CRM',
          budget: 'USD 10k',
          urgency: 'High',
        },
        pricingRule: null,
      });
    prisma.quoteEstimateSnapshot.findFirst
      .mockResolvedValueOnce({
        id: 'snap_prev',
        currency: 'COP',
        effortHours: 120,
        complexityScore: 62.5,
        confidencePct: 76,
        estimatedMinAmount: 9000000,
        estimatedTargetAmount: 12000000,
        estimatedMaxAmount: 15000000,
        breakdown: { baseAmount: 8000000 },
        inputPayload: {
          assumptions: ['Alcance base de CRM'],
          ruleVersionUsed: 9,
        },
      })
      .mockResolvedValue({
        complexityScore: 62.5,
        confidencePct: 76,
        estimatedMinAmount: 9500000,
        estimatedTargetAmount: 12500000,
        estimatedMaxAmount: 16000000,
        breakdown: { baseAmount: 8000000, ownerAdjustedRange: { min: 9500000 } },
        inputPayload: { ruleVersionUsed: 9 },
      });
    prisma.quoteReviewEvent.findFirst.mockResolvedValue({ iteration: 3 });

    const response = await service.applyOwnerAdjustments(
      '573001112233',
      {
        version: 9,
        estimatedMinAmount: 9500000,
        estimatedTargetAmount: 12500000,
        estimatedMaxAmount: 16000000,
        assumptions: ['Fase 1 sin ERP', 'Onboarding separado'],
        reason: 'Ajuste comercial para cerrar este trimestre',
      },
      'socio@example.com',
    );

    expect(prisma.quoteDraft.update).toHaveBeenCalled();
    expect(prisma.quoteEstimateSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        quoteDraftId: 'draft_9',
        estimatedMinAmount: 9500000,
        estimatedTargetAmount: 12500000,
        estimatedMaxAmount: 16000000,
      }),
    });
    expect(prisma.quoteReviewEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        quoteDraftId: 'draft_9',
        reviewStatus: 'ready_for_recheck',
      }),
    });
    expect(response).toMatchObject({
      conversationId: '573001112233',
      reviewStatus: 'ready_for_recheck',
      estimatedTargetAmount: 12500000,
      ruleVersionUsed: 9,
    });
  });

  it('transfers a conversation to explicit human control in bot state', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg_inbound',
      direction: 'inbound',
      fromPhone: '573001112233',
      toPhone: '573009998877',
    });
    botConversationRepository.loadState.mockResolvedValue(null);
    botConversationRepository.rebuildState.mockResolvedValue({
      conversationId: '573001112233',
      state: 'INFO_SERVICES',
      metadata: { topic: 'services_overview' },
      offFlowCount: 2,
      lastInboundMessageId: 'msg_9',
      lastTransitionAt: new Date('2026-04-04T17:00:00.000Z'),
      expiresAt: new Date('2026-04-05T17:00:00.000Z'),
    });

    const response = await service.transferControlToHuman(
      '573001112233',
      'owner@example.com',
    );

    expect(botConversationRepository.saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: '573001112233',
        state: 'HUMAN_HANDOFF',
        offFlowCount: 0,
        metadata: expect.objectContaining({
          ownerNotified: true,
          conversationControl: expect.objectContaining({
            mode: 'human_control',
            actor: 'owner@example.com',
          }),
        }),
      }),
      86400,
    );
    expect(response).toMatchObject({
      conversationId: '573001112233',
      state: 'HUMAN_HANDOFF',
      control: 'human_control',
      updatedBy: 'owner@example.com',
    });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'conversation_control_transferred',
        conversationId: '573001112233',
        actor: 'owner@example.com',
      }),
    );
  });

  it('marks the conversation as pending_resume when CRM returns control to AI', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg_inbound',
      direction: 'inbound',
      fromPhone: '573001112233',
      toPhone: '573009998877',
    });
    botConversationRepository.loadState.mockResolvedValue({
      conversationId: '573001112233',
      state: 'HUMAN_HANDOFF',
      metadata: {
        requestedAt: '2026-04-04T16:40:00.000Z',
        ownerNotified: true,
      },
      offFlowCount: 0,
      lastInboundMessageId: 'msg_10',
      lastTransitionAt: new Date('2026-04-04T16:40:00.000Z'),
      expiresAt: new Date('2026-04-05T16:40:00.000Z'),
    });

    const response = await service.returnControlToAi(
      '573001112233',
      'owner@example.com',
    );

    expect(botConversationRepository.saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: '573001112233',
        state: 'HUMAN_HANDOFF',
        metadata: expect.objectContaining({
          conversationControl: expect.objectContaining({
            mode: 'pending_resume',
            actor: 'owner@example.com',
          }),
        }),
      }),
      86400,
    );
    expect(response).toMatchObject({
      conversationId: '573001112233',
      state: 'HUMAN_HANDOFF',
      control: 'pending_resume',
      updatedBy: 'owner@example.com',
    });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'conversation_control_resumed_ai',
        conversationId: '573001112233',
        actor: 'owner@example.com',
      }),
    );
  });

  it('rejects returning control to AI when the conversation is not in human handoff', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg_inbound',
      direction: 'inbound',
      fromPhone: '573001112233',
      toPhone: '573009998877',
    });
    botConversationRepository.loadState.mockResolvedValue({
      conversationId: '573001112233',
      state: 'QUALIFYING',
      metadata: {
        conversationControl: {
          mode: 'ai_control',
        },
      },
      offFlowCount: 0,
      lastInboundMessageId: 'msg_10',
      lastTransitionAt: new Date('2026-04-04T16:40:00.000Z'),
      expiresAt: new Date('2026-04-05T16:40:00.000Z'),
    });

    await expect(
      service.returnControlToAi('573001112233', 'owner@example.com'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(botConversationRepository.saveState).not.toHaveBeenCalled();
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'conversation_control_resume_failed',
        conversationId: '573001112233',
        actor: 'owner@example.com',
        reason: 'resume_requires_human_handoff_state',
        currentState: 'QUALIFYING',
      }),
    );
  });
});
