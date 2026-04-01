import { NotFoundException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { OwnerReviewService } from '../src/ai-sales/owner-review.service';
import { AuthModule } from '../src/auth/auth.module';
import { ConversationsController } from '../src/conversations/conversations.controller';
import { ConversationsService } from '../src/conversations/conversations.service';
import { MessagingService } from '../src/messaging/messaging.service';
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

type QuoteDraftFixture = {
  id: string;
  conversationId: string;
  version: number;
  reviewStatus:
    | 'pending_owner_review'
    | 'changes_requested'
    | 'ready_for_recheck'
    | 'approved'
    | 'delivered_to_customer';
  renderedQuote: string | null;
  draftPayload: unknown;
  ownerFeedbackSummary: string | null;
  approvedAt: Date | null;
  deliveredToCustomerAt: Date | null;
  updatedAt: Date;
  commercialBrief: {
    customerName: string | null;
    summary: string | null;
    projectType: string | null;
    budget: string | null;
    urgency: string | null;
  };
};

describe('Conversations (e2e)', () => {
  const seededEmail = 'socio@example.com';
  const seededPassword = 'password123';
  const primaryConversationId = '573001112233';
  const secondaryConversationId = '573004445566';

  let durableMessages: MessageFixture[];
  let durableQuoteDrafts: QuoteDraftFixture[];
  let messageProcessor: MessageProcessor;
  let app: any;
  let ownerReviewServiceMock: {
    approveDraftFromCrm: jest.Mock;
    requestChangesFromCrm: jest.Mock;
  };

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

  const baseQuoteDrafts: QuoteDraftFixture[] = [
    {
      id: 'draft_primary_v2',
      conversationId: primaryConversationId,
      version: 2,
      reviewStatus: 'ready_for_recheck',
      renderedQuote: 'Quote for ACME',
      draftPayload: { summary: 'Implementation summary for ACME' },
      ownerFeedbackSummary: 'Confirm final milestones',
      approvedAt: null,
      deliveredToCustomerAt: null,
      updatedAt: new Date('2026-03-18T13:05:00.000Z'),
      commercialBrief: {
        customerName: 'ACME SAS',
        summary: 'Need a CRM',
        projectType: 'CRM',
        budget: 'USD 10k',
        urgency: 'High',
      },
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
        findFirst: jest.fn(
          async ({
            where,
          }: {
            where: { OR: Array<{ fromPhone?: string; toPhone?: string }> };
          }) =>
            durableMessages.find((message) =>
              where.OR.some(
                (candidate) =>
                  (candidate.fromPhone && message.fromPhone === candidate.fromPhone) ||
                  (candidate.toPhone && message.toPhone === candidate.toPhone),
              ),
            ) ?? null,
        ),
      },
      quoteDraft: {
        findMany: jest.fn(
          async ({
            where,
          }: {
            where: {
              conversationId: { in: string[] };
              reviewStatus: { in: QuoteDraftFixture['reviewStatus'][] };
            };
          }) =>
            durableQuoteDrafts
              .filter(
                (draft) =>
                  where.conversationId.in.includes(draft.conversationId) &&
                  where.reviewStatus.in.includes(draft.reviewStatus),
              )
              .sort((left, right) => {
                if (left.conversationId !== right.conversationId) {
                  return left.conversationId.localeCompare(right.conversationId);
                }

                if (left.version !== right.version) {
                  return right.version - left.version;
                }

                return right.updatedAt.getTime() - left.updatedAt.getTime();
              })
              .map((draft) => ({
                id: draft.id,
                conversationId: draft.conversationId,
                version: draft.version,
                reviewStatus: draft.reviewStatus,
              })),
        ),
        findFirst: jest.fn(
          async ({
            where,
          }: {
            where: {
              conversationId: string;
              reviewStatus: { in: QuoteDraftFixture['reviewStatus'][] };
            };
          }) =>
            durableQuoteDrafts
              .filter(
                (draft) =>
                  draft.conversationId === where.conversationId &&
                  where.reviewStatus.in.includes(draft.reviewStatus),
              )
              .sort((left, right) => {
                if (left.version !== right.version) {
                  return right.version - left.version;
                }

                return right.updatedAt.getTime() - left.updatedAt.getTime();
              })[0] ?? null,
        ),
      },
    };

    ownerReviewServiceMock = {
      approveDraftFromCrm: jest.fn(
        async ({
          conversationId,
          version,
        }: {
          conversationId: string;
          version: number;
        }) => {
          const draft = durableQuoteDrafts.find(
            (candidate) =>
              candidate.conversationId === conversationId && candidate.version === version,
          );

          if (!draft) {
            throw new Error('active draft not found');
          }

          draft.reviewStatus = 'delivered_to_customer';
          draft.approvedAt = new Date('2026-04-01T19:00:00.000Z');
          draft.deliveredToCustomerAt = new Date('2026-04-01T19:05:00.000Z');
        },
      ),
      requestChangesFromCrm: jest.fn(
        async ({
          conversationId,
          version,
          feedback,
        }: {
          conversationId: string;
          version: number;
          feedback: string;
        }) => {
          const draft = durableQuoteDrafts.find(
            (candidate) =>
              candidate.conversationId === conversationId && candidate.version === version,
          );

          if (!draft) {
            throw new Error('active draft not found');
          }

          draft.reviewStatus = 'changes_requested';
          draft.ownerFeedbackSummary = feedback;
        },
      ),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
      ],
      controllers: [ConversationsController],
      providers: [
        ConversationsService,
        {
          provide: MessagingService,
          useValue: { sendText: jest.fn() },
        },
        {
          provide: OwnerReviewService,
          useValue: ownerReviewServiceMock,
        },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
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
    const processorMessagingService = {
      sendText: jest.fn(async () => 'kapso-auto-reply'),
      sendInteractiveButtons: jest.fn(async () => 'kapso-auto-reply-interactive'),
    };
    const processorConfig = {
      get: jest.fn((key: string) =>
        key === 'KAPSO_PHONE_NUMBER_ID' ? 'phone_number_id_123' : undefined,
      ),
    };
    const botConversationService = {
      handleInbound: jest.fn(async () => ({
        nextState: 'QUALIFYING',
        outbound: {
          kind: 'text',
          body: 'Gracias por escribirnos',
          source: 'bot-conversation',
        },
      })),
    };

    messageProcessor = new MessageProcessor(
      prismaMock as any,
      channel as any,
      processorMessagingService as any,
      processorConfig as any,
      botConversationService as any,
    );
  });

  beforeEach(() => {
    durableMessages = baseMessages.map((message) => ({
      ...message,
      rawPayload: { ...(message.rawPayload as Record<string, string>) },
      createdAt: new Date(message.createdAt.toISOString()),
    }));
    durableQuoteDrafts = baseQuoteDrafts.map((draft) => ({
      ...draft,
      draftPayload: { ...(draft.draftPayload as Record<string, string>) },
      approvedAt: draft.approvedAt ? new Date(draft.approvedAt.toISOString()) : null,
      deliveredToCustomerAt: draft.deliveredToCustomerAt
        ? new Date(draft.deliveredToCustomerAt.toISOString())
        : null,
      updatedAt: new Date(draft.updatedAt.toISOString()),
      commercialBrief: { ...draft.commercialBrief },
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

  it('rejects unauthenticated requests for list, history, and quote review endpoints', async () => {
    await request(app.getHttpServer()).get('/conversations').expect(401);
    await request(app.getHttpServer())
      .get(`/conversations/${primaryConversationId}/messages`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/conversations/${primaryConversationId}/quote-review`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`/conversations/${primaryConversationId}/quote-review/approve`)
      .send({ version: 2 })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/conversations/${primaryConversationId}/quote-review/request-changes`)
      .send({ version: 2, feedback: 'Ajusta hitos' })
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
        pendingQuote: {
          conversationId: primaryConversationId,
          quoteDraftId: 'draft_primary_v2',
          version: 2,
          reviewStatus: 'ready_for_recheck',
        },
      },
      {
        id: secondaryConversationId,
        contactName: secondaryConversationId,
        lastMessage: 'otra conversación',
        lastMessageAt: '2026-03-18T11:00:00.000Z',
        unreadCount: 0,
        pendingQuote: null,
      },
    ]);
  });

  it('returns quote review detail for the selected stable conversation id', async () => {
    const cookie = await loginAndGetCookie();

    const response = await request(app.getHttpServer())
      .get(`/conversations/${primaryConversationId}/quote-review`)
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body).toEqual({
      conversationId: primaryConversationId,
      quoteDraftId: 'draft_primary_v2',
      version: 2,
      reviewStatus: 'ready_for_recheck',
      renderedQuote: 'Quote for ACME',
      draftSummary: 'Implementation summary for ACME',
      ownerFeedbackSummary: 'Confirm final milestones',
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
  });

  it('approves the active draft through the conversations route and returns deliveredToCustomerAt', async () => {
    const cookie = await loginAndGetCookie();

    const response = await request(app.getHttpServer())
      .post(`/conversations/${primaryConversationId}/quote-review/approve`)
      .set('Cookie', cookie)
      .send({ version: 2 })
      .expect(201);

    expect(ownerReviewServiceMock.approveDraftFromCrm).toHaveBeenCalledWith({
      action: 'approve',
      conversationId: primaryConversationId,
      version: 2,
      reviewerPhone: seededEmail,
    });
    expect(response.body).toMatchObject({
      conversationId: primaryConversationId,
      reviewStatus: 'delivered_to_customer',
      deliveredToCustomerAt: '2026-04-01T19:05:00.000Z',
    });
  });

  it('requires feedback when requesting quote changes', async () => {
    const cookie = await loginAndGetCookie();

    await request(app.getHttpServer())
      .post(`/conversations/${primaryConversationId}/quote-review/request-changes`)
      .set('Cookie', cookie)
      .send({ version: 2, feedback: '' })
      .expect(400);
  });

  it('returns 404 when quote approval targets a stale or missing version', async () => {
    const cookie = await loginAndGetCookie();
    ownerReviewServiceMock.approveDraftFromCrm.mockRejectedValueOnce(
      new NotFoundException(
        'Quote draft 573001112233 v999 is not the active review version.',
      ),
    );

    await request(app.getHttpServer())
      .post(`/conversations/${primaryConversationId}/quote-review/approve`)
      .set('Cookie', cookie)
      .send({ version: 999 })
      .expect(404);
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

  it('returns 404 when the conversation exists but has no quote review draft', async () => {
    const cookie = await loginAndGetCookie();

    await request(app.getHttpServer())
      .get(`/conversations/${secondaryConversationId}/quote-review`)
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
      pendingQuote: {
        conversationId: primaryConversationId,
        quoteDraftId: 'draft_primary_v2',
        version: 2,
        reviewStatus: 'ready_for_recheck',
      },
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
    expect(durableMessages).toHaveLength(5);
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
