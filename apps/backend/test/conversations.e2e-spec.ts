import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { ConversationsModule } from '../src/conversations/conversations.module';
import { MessageProcessor } from '../src/messaging/processors/message.processor';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';

type MessageFixture = {
  id: string;
  externalMessageId: string;
  direction: 'inbound' | 'outbound';
  fromPhone: string;
  toPhone: string;
  body: string | null;
  channel: string;
  rawPayload: unknown;
  createdAt: Date;
};

describe('Conversations (e2e)', () => {
  const seededEmail = 'socio@example.com';
  const seededPassword = 'password123';
  const primaryConversationId = '573001112233';
  const secondaryConversationId = '573004445566';

  let durableMessages: MessageFixture[];
  let messageProcessor: MessageProcessor;
  let app: any;

  const baseMessages: MessageFixture[] = [
    {
      id: 'msg_inbound',
      externalMessageId: 'kapso-msg_inbound',
      direction: 'inbound',
      fromPhone: '573001112233',
      toPhone: '573009998877',
      body: 'hola',
      channel: 'whatsapp',
      rawPayload: { fixture: 'msg_inbound' },
      createdAt: new Date('2026-03-18T12:00:00.000Z'),
    },
    {
      id: 'msg_outbound',
      externalMessageId: 'kapso-msg_outbound',
      direction: 'outbound',
      fromPhone: '573009998877',
      toPhone: '573001112233',
      body: 'te respondo',
      channel: 'whatsapp',
      rawPayload: { fixture: 'msg_outbound' },
      createdAt: new Date('2026-03-18T13:00:00.000Z'),
    },
    {
      id: 'msg_other',
      externalMessageId: 'kapso-msg_other',
      direction: 'inbound',
      fromPhone: '573004445566',
      toPhone: '573009998877',
      body: 'otra conversación',
      channel: 'whatsapp',
      rawPayload: { fixture: 'msg_other' },
      createdAt: new Date('2026-03-18T11:00:00.000Z'),
    },
  ];

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test_jwt_secret';
    process.env.JWT_EXPIRY = '8h';

    const passwordHash = await argon2.hash(seededPassword);
    const prismaMock = {
      user: {
        findUnique: jest.fn(
          async ({ where }: { where: { email: string } }) =>
            where.email === seededEmail
              ? { id: 'user_1', email: seededEmail, passwordHash }
              : null,
        ),
      },
      message: {
        create: jest.fn(async ({ data }: { data: Omit<MessageFixture, 'id' | 'createdAt'> }) => {
          const duplicate = durableMessages.find(
            (message) => message.externalMessageId === data.externalMessageId,
          );

          if (duplicate) {
            throw { code: 'P2002' };
          }

          const createdMessage: MessageFixture = {
            id: `db_${durableMessages.length + 1}`,
            externalMessageId: data.externalMessageId,
            direction: data.direction,
            fromPhone: data.fromPhone,
            toPhone: data.toPhone,
            body: data.body,
            channel: data.channel,
            rawPayload: data.rawPayload,
            createdAt: new Date('2026-03-18T14:00:00.000Z'),
          };

          durableMessages.push(createdMessage);
          return createdMessage;
        }),
        findMany: jest.fn(
          async ({
            orderBy,
          }: {
            orderBy: { createdAt: 'asc' | 'desc' };
          }) =>
            [...durableMessages].sort((left, right) =>
              orderBy.createdAt === 'asc'
                ? left.createdAt.getTime() - right.createdAt.getTime()
                : right.createdAt.getTime() - left.createdAt.getTime(),
            ),
        ),
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        ConversationsModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const channel = {
      normalizeInbound: jest.fn((payload: any) => ({
        externalMessageId: payload.messageId,
        direction: 'inbound',
        fromPhone: payload.fromPhone,
        toPhone: payload.toPhone,
        body: payload.body,
        channel: 'whatsapp',
        rawPayload: payload,
      })),
    };

    messageProcessor = new MessageProcessor(prismaMock as any, channel as any);
  });

  beforeEach(() => {
    durableMessages = baseMessages.map((message) => ({
      ...message,
      rawPayload: { ...(message.rawPayload as Record<string, string>) },
      createdAt: new Date(message.createdAt.toISOString()),
    }));
  });

  afterAll(async () => {
    await app?.close();
  });

  async function persistInboundDelivery(payload: {
    messageId: string;
    fromPhone: string;
    toPhone: string;
    body: string;
  }): Promise<void> {
    await messageProcessor.process({ data: { payload } } as any);
  }

  async function loginAndGetCookie(): Promise<string[]> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: seededEmail, password: seededPassword })
      .expect(200);

    return response.headers['set-cookie'];
  }

  it('rejects unauthenticated requests for list and history endpoints', async () => {
    await request(app.getHttpServer()).get('/conversations').expect(401);
    await request(app.getHttpServer())
      .get(`/conversations/${primaryConversationId}/messages`)
      .expect(401);
  });

  it('returns authenticated conversation summaries using stable ids', async () => {
    const cookie = await loginAndGetCookie();

    const response = await request(app.getHttpServer())
      .get('/conversations')
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body).toEqual([
      {
        id: primaryConversationId,
        contactName: primaryConversationId,
        lastMessage: 'te respondo',
        lastMessageAt: '2026-03-18T13:00:00.000Z',
        unreadCount: 0,
      },
      {
        id: secondaryConversationId,
        contactName: secondaryConversationId,
        lastMessage: 'otra conversación',
        lastMessageAt: '2026-03-18T11:00:00.000Z',
        unreadCount: 0,
      },
    ]);
  });

  it('returns chronological history for a selected conversation id from the list', async () => {
    const cookie = await loginAndGetCookie();
    const conversationsResponse = await request(app.getHttpServer())
      .get('/conversations')
      .set('Cookie', cookie)
      .expect(200);

    const [selectedConversation] = conversationsResponse.body;

    const historyResponse = await request(app.getHttpServer())
      .get(`/conversations/${selectedConversation.id}/messages`)
      .set('Cookie', cookie)
      .expect(200);

    expect(selectedConversation.id).toBe(primaryConversationId);
    expect(historyResponse.body).toEqual([
      {
        id: 'msg_inbound',
        conversationId: primaryConversationId,
        direction: 'inbound',
        body: 'hola',
        createdAt: '2026-03-18T12:00:00.000Z',
      },
      {
        id: 'msg_outbound',
        conversationId: primaryConversationId,
        direction: 'outbound',
        body: 'te respondo',
        createdAt: '2026-03-18T13:00:00.000Z',
      },
    ]);
    expect(
      historyResponse.body.every(
        (message: { conversationId: string }) =>
          message.conversationId === selectedConversation.id,
      ),
    ).toBe(true);
  });

  it('returns 404 for unknown conversation ids', async () => {
    const cookie = await loginAndGetCookie();

    await request(app.getHttpServer())
      .get('/conversations/573000000000/messages')
      .set('Cookie', cookie)
      .expect(404);
  });

  it('projects one persisted inbound Kapso delivery into both conversation endpoints with a stable id', async () => {
    const inboundPayload = {
      messageId: 'kapso-msg_new_inbound',
      fromPhone: primaryConversationId,
      toPhone: '573009998877',
      body: 'nuevo inbound',
    };

    await persistInboundDelivery(inboundPayload);

    const cookie = await loginAndGetCookie();
    const conversationsResponse = await request(app.getHttpServer())
      .get('/conversations')
      .set('Cookie', cookie)
      .expect(200);

    const projectedConversation = conversationsResponse.body.find(
      (conversation: { id: string }) => conversation.id === primaryConversationId,
    );

    expect(projectedConversation).toEqual({
      id: primaryConversationId,
      contactName: primaryConversationId,
      lastMessage: inboundPayload.body,
      lastMessageAt: '2026-03-18T14:00:00.000Z',
      unreadCount: 0,
    });

    const historyResponse = await request(app.getHttpServer())
      .get(`/conversations/${projectedConversation.id}/messages`)
      .set('Cookie', cookie)
      .expect(200);

    expect(
      historyResponse.body.some(
        (message: { conversationId: string; body: string }) =>
          message.conversationId === primaryConversationId && message.body === inboundPayload.body,
      ),
    ).toBe(true);
    expect(durableMessages).toHaveLength(4);
  });

  it('treats repeated inbound deliveries as one durable row while the read model still shows a single message', async () => {
    const inboundPayload = {
      messageId: 'kapso-msg_duplicate',
      fromPhone: primaryConversationId,
      toPhone: '573009998877',
      body: 'mensaje único',
    };

    await persistInboundDelivery(inboundPayload);
    await persistInboundDelivery(inboundPayload);

    expect(
      durableMessages.filter(
        (message) => message.externalMessageId === inboundPayload.messageId,
      ),
    ).toHaveLength(1);

    const cookie = await loginAndGetCookie();
    const historyResponse = await request(app.getHttpServer())
      .get(`/conversations/${primaryConversationId}/messages`)
      .set('Cookie', cookie)
      .expect(200);

    expect(
      historyResponse.body.filter(
        (message: { body: string }) => message.body === inboundPayload.body,
      ),
    ).toHaveLength(1);
    expect(
      historyResponse.body.every(
        (message: { conversationId: string }) => message.conversationId === primaryConversationId,
      ),
    ).toBe(true);
  });
});
