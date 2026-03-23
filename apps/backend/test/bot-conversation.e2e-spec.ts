import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConversationFlowService } from '../src/ai-sales/conversation-flow.service';
import { BotConversationRepository } from '../src/bot-conversation/bot-conversation.repository';
import {
  BOT_CONVERSATION_TTL_SECONDS,
  BotConversationService,
  BotConversationState,
} from '../src/bot-conversation/bot-conversation.service';
import { HumanHandoffService } from '../src/bot-conversation/human-handoff.service';
import { IntentClassifierService } from '../src/bot-conversation/intent-classifier.service';
import { ChannelAdapter, type NormalizedMessage } from '../src/channels/channel.adapter';
import { MessageProcessor } from '../src/messaging/processors/message.processor';
import { MessagingService } from '../src/messaging/messaging.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

type PersistedConversationState = {
  id: string;
  conversationId: string;
  state: string;
  metadata: Record<string, unknown> | null;
  offFlowCount: number;
  lastInboundMessageId: string | null;
  lastTransitionAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

describe('Bot conversation continuity (e2e)', () => {
  let processor: MessageProcessor;
  let channel: {
    normalizeInbound: jest.Mock;
    sendText: jest.Mock;
    sendTemplate: jest.Mock;
    sendInteractiveButtons: jest.Mock;
  };
  let conversationFlowService: { planReply: jest.Mock };
  let conversationStates: Map<string, PersistedConversationState>;
  let redisState: Map<string, string>;
  let messages: Array<Record<string, any>>;
  let outboundCounter: number;

  const conversationId = '573001112233';
  const redisKey = `bot:fsm:${conversationId}`;

  beforeEach(async () => {
    conversationStates = new Map<string, PersistedConversationState>();
    redisState = new Map<string, string>();
    messages = [];
    outboundCounter = 0;

    channel = {
      normalizeInbound: jest.fn((payload: NormalizedMessage) => payload),
      sendText: jest.fn(async () => `out_text_${++outboundCounter}`),
      sendTemplate: jest.fn(async () => undefined),
      sendInteractiveButtons: jest.fn(async () => `out_buttons_${++outboundCounter}`),
    };

    conversationFlowService = {
      planReply: jest.fn(async ({ inboundBody }: { inboundBody: string | null }) => ({
        body: `Seguimos con tu proyecto: ${inboundBody ?? '(sin texto)'}`,
        source: 'commercial-discovery',
      })),
    };

    const prisma = {
      message: {
        create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
          const duplicate = messages.find(
            (message) => message.externalMessageId === data.externalMessageId,
          );

          if (duplicate) {
            throw { code: 'P2002' };
          }

          const record = {
            id: `msg_${messages.length + 1}`,
            createdAt: new Date(),
            ...data,
          };
          messages.push(record);
          return record;
        }),
      },
      conversationState: {
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { conversationId: string };
            create: Omit<PersistedConversationState, 'id' | 'createdAt' | 'updatedAt'>;
            update: Partial<PersistedConversationState>;
          }) => {
            const existing = conversationStates.get(where.conversationId);
            const now = new Date();
            const record: PersistedConversationState = existing
              ? {
                  ...existing,
                  ...update,
                  updatedAt: now,
                }
              : {
                  id: `state_${conversationStates.size + 1}`,
                  ...create,
                  createdAt: now,
                  updatedAt: now,
                };
            conversationStates.set(where.conversationId, record);
            return record;
          },
        ),
        findUnique: jest.fn(async ({ where }: { where: { conversationId: string } }) => {
          return conversationStates.get(where.conversationId) ?? null;
        }),
      },
    };

    const redis = {
      get: jest.fn(async (key: string) => redisState.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        redisState.set(key, value);
        return 'OK';
      }),
      del: jest.fn(async (key: string) => {
        const existed = redisState.delete(key);
        return existed ? 1 : 0;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MessageProcessor,
        MessagingService,
        BotConversationService,
        BotConversationRepository,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: REDIS_CLIENT,
          useValue: redis,
        },
        {
          provide: ChannelAdapter,
          useValue: channel,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'KAPSO_PHONE_NUMBER_ID':
                  return 'phone_number_id_123';
                case 'AI_SALES_OWNER_PHONE':
                  return '+573009998887';
                default:
                  return undefined;
              }
            }),
          },
        },
        {
          provide: ConversationFlowService,
          useValue: conversationFlowService,
        },
        {
          provide: HumanHandoffService,
          useValue: { notifyOwner: jest.fn(async () => undefined) },
        },
        {
          provide: IntentClassifierService,
          useValue: { classifyGreetingIntent: jest.fn(async () => 'quote_project') },
        },
      ],
    }).compile();

    processor = moduleRef.get(MessageProcessor);
  });

  it('rebuilds Redis from the Prisma backup so a qualifying conversation survives restart', async () => {
    const greetingInbound: NormalizedMessage = {
      externalMessageId: 'msg_1',
      direction: 'inbound',
      fromPhone: conversationId,
      toPhone: 'phone_number_id_123',
      body: 'Hola',
      messageType: 'text',
      interactiveReply: null,
      channel: 'whatsapp',
      rawPayload: { id: 'msg_1' },
    };
    const quoteSelectionInbound: NormalizedMessage = {
      ...greetingInbound,
      externalMessageId: 'msg_2',
      body: 'Cotizar proyecto',
      messageType: 'interactive',
      interactiveReply: {
        id: 'QUOTE_PROJECT',
        title: 'Cotizar proyecto',
      },
      rawPayload: { id: 'msg_2' },
    };
    const resumedInbound: NormalizedMessage = {
      ...greetingInbound,
      externalMessageId: 'msg_3',
      body: 'Necesito integrar HubSpot con WhatsApp',
      rawPayload: { id: 'msg_3' },
    };

    await processor.process({ data: { payload: greetingInbound } } as any);
    await processor.process({ data: { payload: quoteSelectionInbound } } as any);

    expect(channel.sendInteractiveButtons).toHaveBeenCalledTimes(1);
    expect(conversationFlowService.planReply).toHaveBeenCalledTimes(1);

    redisState.clear();

    await processor.process({ data: { payload: resumedInbound } } as any);

    expect(conversationFlowService.planReply).toHaveBeenCalledTimes(2);
    expect(conversationFlowService.planReply).toHaveBeenLastCalledWith({
      conversationId,
      inboundMessageId: 'msg_3',
      inboundBody: 'Necesito integrar HubSpot con WhatsApp',
    });
    expect(channel.sendText).toHaveBeenLastCalledWith(
      conversationId,
      'Seguimos con tu proyecto: Necesito integrar HubSpot con WhatsApp',
      'phone_number_id_123',
    );

    const cachedSnapshot = JSON.parse(redisState.get(redisKey) ?? '{}');
    expect(cachedSnapshot.state).toBe(BotConversationState.QUALIFYING);
    expect(cachedSnapshot.lastInboundMessageId).toBe('msg_3');
    expect(conversationStates.get(conversationId)).toMatchObject({
      state: BotConversationState.QUALIFYING,
      lastInboundMessageId: 'msg_3',
      metadata: { delegatedToAiSales: true },
    });
    expect(messages.at(-1)).toMatchObject({
      direction: 'outbound',
      body: 'Seguimos con tu proyecto: Necesito integrar HubSpot con WhatsApp',
      rawPayload: expect.objectContaining({
        state: BotConversationState.QUALIFYING,
        replyToExternalMessageId: 'msg_3',
      }),
    });
  });

  it('resets expired backup state to the returning-contact greeting after Redis loss', async () => {
    const expiredTransitionAt = new Date(Date.now() - (BOT_CONVERSATION_TTL_SECONDS + 120) * 1000);
    conversationStates.set(conversationId, {
      id: 'state_existing',
      conversationId,
      state: BotConversationState.QUALIFYING,
      metadata: { delegatedToAiSales: true },
      offFlowCount: 2,
      lastInboundMessageId: 'msg_old',
      lastTransitionAt: expiredTransitionAt,
      expiresAt: new Date(expiredTransitionAt.getTime() + BOT_CONVERSATION_TTL_SECONDS * 1000),
      createdAt: expiredTransitionAt,
      updatedAt: expiredTransitionAt,
    });

    const returningInbound: NormalizedMessage = {
      externalMessageId: 'msg_return',
      direction: 'inbound',
      fromPhone: conversationId,
      toPhone: 'phone_number_id_123',
      body: 'Hola otra vez',
      messageType: 'text',
      interactiveReply: null,
      channel: 'whatsapp',
      rawPayload: { id: 'msg_return' },
    };

    await processor.process({ data: { payload: returningInbound } } as any);

    expect(channel.sendInteractiveButtons).toHaveBeenCalledWith(
      conversationId,
      expect.stringContaining('Hola de nuevo'),
      expect.any(Array),
      'phone_number_id_123',
    );
    expect(conversationFlowService.planReply).not.toHaveBeenCalled();
    expect(conversationStates.get(conversationId)).toMatchObject({
      state: BotConversationState.GREETING,
      metadata: { greetingVariant: 'returning_contact' },
      offFlowCount: 0,
      lastInboundMessageId: 'msg_return',
    });

    const cachedSnapshot = JSON.parse(redisState.get(redisKey) ?? '{}');
    expect(cachedSnapshot.state).toBe(BotConversationState.GREETING);
    expect(cachedSnapshot.metadata).toEqual({ greetingVariant: 'returning_contact' });
  });
});
