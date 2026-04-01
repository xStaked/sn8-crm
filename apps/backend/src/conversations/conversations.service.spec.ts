import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessagingService } from '../messaging/messaging.service';
import { PrismaService } from '../prisma/prisma.service';
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
    };
  };
  let messagingService: { sendText: jest.Mock };
  let config: { get: jest.Mock };
  let service: ConversationsService;

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
      },
    };

    messagingService = {
      sendText: jest.fn(),
    };

    config = {
      get: jest.fn(),
    };

    service = new ConversationsService(
      prisma as unknown as PrismaService,
      messagingService as unknown as MessagingService,
      config as unknown as ConfigService,
    );
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
      reviewStatus: 'approved',
      renderedQuote: 'Quote body',
      draftPayload: { summary: 'Executive summary' },
      ownerFeedbackSummary: 'Update the milestones',
      approvedAt: new Date('2026-04-01T19:00:00.000Z'),
      deliveredToCustomerAt: new Date('2026-04-01T19:05:00.000Z'),
      commercialBrief: {
        customerName: 'ACME SAS',
        summary: 'Need a CRM',
        projectType: 'CRM',
        budget: 'USD 10k',
        urgency: 'High',
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
    });
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
});
