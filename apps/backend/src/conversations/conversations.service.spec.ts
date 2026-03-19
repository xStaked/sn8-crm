import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from './conversations.service';

describe('ConversationsService', () => {
  let prisma: { message: { findMany: jest.Mock } };
  let service: ConversationsService;

  beforeEach(() => {
    prisma = {
      message: {
        findMany: jest.fn(),
      },
    };

    service = new ConversationsService(prisma as unknown as PrismaService);
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

    await expect(service.listConversations()).resolves.toEqual([
      {
        id: '573001112233',
        contactName: '573001112233',
        lastMessage: 'seguimiento',
        lastMessageAt: '2026-03-18T12:00:00.000Z',
        unreadCount: 0,
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

    const conversations = await service.listConversations();

    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      id: '573001112233',
      contactName: '573001112233',
      lastMessage: 'te respondo',
      unreadCount: 0,
    });
    expect(conversations[0].id).not.toBe('msg_outbound');
    expect(conversations[0].id).not.toBe('msg_inbound');
  });

  it('sorts summaries by newest activity first', async () => {
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'msg_latest',
        direction: 'inbound',
        fromPhone: '573001112233',
        toPhone: '573009998877',
        body: 'mas reciente',
        createdAt: new Date('2026-03-18T15:00:00.000Z'),
      },
      {
        id: 'msg_older',
        direction: 'inbound',
        fromPhone: '573004445566',
        toPhone: '573009998877',
        body: 'anterior',
        createdAt: new Date('2026-03-18T11:00:00.000Z'),
      },
    ]);

    const conversations = await service.listConversations();

    expect(conversations.map((conversation) => conversation.id)).toEqual([
      '573001112233',
      '573004445566',
    ]);
  });

  it('uses an empty string when the latest message body is null', async () => {
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'msg_null_body',
        direction: 'inbound',
        fromPhone: '573001112233',
        toPhone: '573009998877',
        body: null,
        createdAt: new Date('2026-03-18T09:00:00.000Z'),
      },
    ]);

    await expect(service.listConversations()).resolves.toEqual([
      {
        id: '573001112233',
        contactName: '573001112233',
        lastMessage: '',
        lastMessageAt: '2026-03-18T09:00:00.000Z',
        unreadCount: 0,
      },
    ]);
  });

  it('queries messages newest-first before projecting summaries', async () => {
    prisma.message.findMany.mockResolvedValue([]);

    await service.listConversations();

    expect(prisma.message.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        direction: true,
        fromPhone: true,
        toPhone: true,
        body: true,
        createdAt: true,
      },
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
});
