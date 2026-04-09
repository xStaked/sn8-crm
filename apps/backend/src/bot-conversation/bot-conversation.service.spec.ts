import { ConversationFlowService } from '../ai-sales/conversation-flow.service';
import type { NormalizedMessage } from '../channels/channel.adapter';
import { BotConversationRepository } from './bot-conversation.repository';
import { HumanHandoffService } from './human-handoff.service';
import { IntentClassifierService } from './intent-classifier.service';
import {
  BOT_CONVERSATION_TTL_SECONDS,
  BotConversationState,
  type BotConversationSnapshot,
  BotConversationService,
} from './bot-conversation.service';

describe('BotConversationService', () => {
  let repository: jest.Mocked<BotConversationRepository>;
  let conversationFlowService: { planReply: jest.Mock };
  let humanHandoffService: { notifyOwner: jest.Mock };
  let intentClassifierService: { classifyGreetingIntent: jest.Mock };
  let service: BotConversationService;

  const snapshot: BotConversationSnapshot = {
    conversationId: '573001112233',
    state: BotConversationState.GREETING,
    metadata: { source: 'test' },
    offFlowCount: 1,
    lastInboundMessageId: 'msg_1',
    lastTransitionAt: new Date('2026-03-23T15:00:00.000Z'),
    expiresAt: new Date('2099-03-24T15:00:00.000Z'),
  };

  const normalizedMessage: NormalizedMessage = {
    externalMessageId: 'msg_1',
    direction: 'inbound',
    fromPhone: '573001112233',
    toPhone: 'kapso-phone-id',
    body: 'Hola',
    messageType: 'text',
    interactiveReply: null,
    channel: 'whatsapp',
    rawPayload: { id: 'msg_1' },
  };

  beforeEach(() => {
    repository = {
      loadState: jest.fn(),
      saveState: jest.fn(),
      rebuildState: jest.fn(),
    } as unknown as jest.Mocked<BotConversationRepository>;

    conversationFlowService = {
      planReply: jest.fn(),
    };

    humanHandoffService = {
      notifyOwner: jest.fn(),
    };

    intentClassifierService = {
      classifyGreetingIntent: jest.fn(),
    };

    service = new BotConversationService(
      repository,
      conversationFlowService as unknown as ConversationFlowService,
      humanHandoffService as unknown as HumanHandoffService,
      intentClassifierService as unknown as IntentClassifierService,
    );
  });

  it('writes state through the repository using the 24-hour TTL contract', async () => {
    repository.saveState.mockResolvedValue(snapshot);

    await service.transition({
      conversationId: snapshot.conversationId,
      state: snapshot.state,
      metadata: snapshot.metadata,
      offFlowCount: snapshot.offFlowCount,
      lastInboundMessageId: snapshot.lastInboundMessageId,
      lastTransitionAt: snapshot.lastTransitionAt,
    });

    expect(repository.saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: snapshot.conversationId,
        state: snapshot.state,
        metadata: snapshot.metadata,
        offFlowCount: snapshot.offFlowCount,
        lastInboundMessageId: snapshot.lastInboundMessageId,
        lastTransitionAt: snapshot.lastTransitionAt,
      }),
      BOT_CONVERSATION_TTL_SECONDS,
    );
  });

  it('rebuilds Redis state from the durable backup when the primary cache misses', async () => {
    repository.loadState.mockResolvedValueOnce(null);
    repository.rebuildState.mockResolvedValueOnce(snapshot);

    await expect(service.loadState(snapshot.conversationId)).resolves.toEqual(snapshot);

    expect(repository.loadState).toHaveBeenCalledWith(snapshot.conversationId);
    expect(repository.rebuildState).toHaveBeenCalledWith(snapshot.conversationId);
  });

  it('treats expired durable backup state as inactive when loading a conversation directly', async () => {
    repository.loadState.mockResolvedValueOnce(null);
    repository.rebuildState.mockResolvedValueOnce({
      ...snapshot,
      state: BotConversationState.QUALIFYING,
      expiresAt: new Date('2026-03-22T15:00:00.000Z'),
    });

    await expect(service.loadState(snapshot.conversationId)).resolves.toBeNull();
  });

  it('greets first-contact conversations with interactive buttons and stores GREETING state', async () => {
    repository.loadState.mockResolvedValue(null);
    repository.rebuildState.mockResolvedValue(null);
    repository.saveState.mockResolvedValue({
      ...snapshot,
      metadata: { greetingVariant: 'first_contact' },
    });

    await expect(service.handleInbound(normalizedMessage)).resolves.toMatchObject({
      nextState: BotConversationState.GREETING,
      outbound: {
        kind: 'interactive-buttons',
        body: expect.stringContaining('SN8 Labs'),
        buttons: [
          { id: 'QUOTE_PROJECT', title: 'Cotizar proyecto' },
          { id: 'INFO_SERVICES', title: 'Conocer servicios' },
          { id: 'HUMAN_HANDOFF', title: 'Hablar con alguien' },
        ],
      },
    });

    expect(repository.saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: normalizedMessage.fromPhone,
        state: BotConversationState.GREETING,
        lastInboundMessageId: normalizedMessage.externalMessageId,
        metadata: { greetingVariant: 'first_contact' },
      }),
      BOT_CONVERSATION_TTL_SECONDS,
    );
  });

  it('routes INFO_SERVICES button taps to the info state with bounded copy', async () => {
    repository.loadState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.GREETING,
      expiresAt: new Date('2099-03-24T15:00:00.000Z'),
    });
    repository.saveState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.INFO_SERVICES,
      metadata: { topic: 'services_overview' },
    });

    await expect(
      service.handleInbound({
        ...normalizedMessage,
        body: 'Conocer servicios',
        messageType: 'interactive',
        interactiveReply: {
          id: 'INFO_SERVICES',
          title: 'Conocer servicios',
        },
      }),
    ).resolves.toMatchObject({
      nextState: BotConversationState.INFO_SERVICES,
      outbound: {
        kind: 'text',
        body: expect.stringContaining('automatizaciones'),
      },
    });

    expect(repository.saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        state: BotConversationState.INFO_SERVICES,
        metadata: { topic: 'services_overview' },
      }),
      BOT_CONVERSATION_TTL_SECONDS,
    );
  });

  it('notifies the owner and moves to HUMAN_HANDOFF when requested', async () => {
    repository.loadState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.GREETING,
      expiresAt: new Date('2099-03-24T15:00:00.000Z'),
    });
    repository.saveState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.HUMAN_HANDOFF,
      metadata: { ownerNotified: true },
    });

    await expect(
      service.handleInbound({
        ...normalizedMessage,
        body: 'Hablar con alguien',
        messageType: 'interactive',
        interactiveReply: {
          id: 'HUMAN_HANDOFF',
          title: 'Hablar con alguien',
        },
      }),
    ).resolves.toMatchObject({
      nextState: BotConversationState.HUMAN_HANDOFF,
      outbound: {
        kind: 'text',
        body: expect.stringContaining('asesor'),
      },
    });

    expect(humanHandoffService.notifyOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: normalizedMessage.fromPhone,
        inboundMessageId: normalizedMessage.externalMessageId,
        customerMessageBody: 'Hablar con alguien',
      }),
    );
  });

  it('resumes active QUALIFYING conversations without repeating the greeting', async () => {
    repository.loadState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.QUALIFYING,
      expiresAt: new Date('2099-03-24T15:00:00.000Z'),
    });
    conversationFlowService.planReply.mockResolvedValue({
      body: 'Cuéntame más sobre tu proyecto.',
      source: 'commercial-discovery',
    });
    repository.saveState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.QUALIFYING,
      metadata: { delegatedToAiSales: true },
    });

    await expect(service.handleInbound(normalizedMessage)).resolves.toMatchObject({
      nextState: BotConversationState.QUALIFYING,
      outbound: {
        kind: 'text',
        body: 'Cuéntame más sobre tu proyecto.',
      },
    });

    expect(conversationFlowService.planReply).toHaveBeenCalledWith({
      conversationId: normalizedMessage.fromPhone,
      inboundMessageId: normalizedMessage.externalMessageId,
      inboundBody: normalizedMessage.body,
      channel: 'whatsapp',
    });
  });

  it('resumes AI flow on next inbound when HUMAN_HANDOFF control is pending_resume', async () => {
    repository.loadState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.HUMAN_HANDOFF,
      metadata: {
        requestedAt: '2026-04-04T17:00:00.000Z',
        ownerNotified: true,
        conversationControl: {
          mode: 'pending_resume',
          updatedAt: '2026-04-04T17:05:00.000Z',
          actor: 'owner@example.com',
        },
      },
      expiresAt: new Date('2099-03-24T15:00:00.000Z'),
    });
    conversationFlowService.planReply.mockResolvedValue({
      body: 'Retomemos el briefing para preparar tu propuesta.',
      source: 'commercial-discovery',
    });
    repository.saveState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.QUALIFYING,
      metadata: {
        delegatedToAiSales: true,
        conversationControl: {
          mode: 'ai_control',
          updatedAt: '2026-04-04T17:06:00.000Z',
          actor: 'system',
        },
      },
    });

    await expect(service.handleInbound(normalizedMessage)).resolves.toMatchObject({
      nextState: BotConversationState.QUALIFYING,
      outbound: {
        kind: 'text',
        body: 'Retomemos el briefing para preparar tu propuesta.',
      },
    });

    expect(conversationFlowService.planReply).toHaveBeenCalledWith({
      conversationId: normalizedMessage.fromPhone,
      inboundMessageId: normalizedMessage.externalMessageId,
      inboundBody: normalizedMessage.body,
      channel: 'whatsapp',
    });
  });

  it('classifies free-text greeting messages into the quote path and delegates to AI sales', async () => {
    repository.loadState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.GREETING,
      offFlowCount: 2,
      expiresAt: new Date('2099-03-24T15:00:00.000Z'),
    });
    intentClassifierService.classifyGreetingIntent.mockResolvedValue('quote_project');
    conversationFlowService.planReply.mockResolvedValue({
      body: 'Cuéntame qué quieres construir.',
      source: 'commercial-discovery',
    });
    repository.saveState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.QUALIFYING,
      offFlowCount: 0,
      metadata: { delegatedToAiSales: true },
    });

    await expect(
      service.handleInbound({
        ...normalizedMessage,
        body: 'Necesito una cotización para una automatización',
      }),
    ).resolves.toMatchObject({
      nextState: BotConversationState.QUALIFYING,
      outbound: {
        kind: 'text',
        body: 'Cuéntame qué quieres construir.',
      },
    });

    expect(intentClassifierService.classifyGreetingIntent).toHaveBeenCalledWith(
      'Necesito una cotización para una automatización',
    );
    expect(repository.saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        state: BotConversationState.QUALIFYING,
        offFlowCount: 0,
        metadata: expect.objectContaining({
          delegatedToAiSales: true,
          conversationControl: expect.objectContaining({
            mode: 'ai_control',
            actor: 'system',
          }),
        }),
      }),
      BOT_CONVERSATION_TTL_SECONDS,
    );
  });

  it('biases ambiguous free-text greeting messages toward the quote path', async () => {
    repository.loadState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.GREETING,
      expiresAt: new Date('2099-03-24T15:00:00.000Z'),
    });
    intentClassifierService.classifyGreetingIntent.mockResolvedValue('quote_project');
    conversationFlowService.planReply.mockResolvedValue({
      body: 'Perfecto, empecemos por tu proyecto.',
      source: 'commercial-discovery',
    });
    repository.saveState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.QUALIFYING,
      offFlowCount: 0,
      metadata: { delegatedToAiSales: true },
    });

    await service.handleInbound({
      ...normalizedMessage,
      body: 'Hola, quiero saber si me pueden ayudar',
    });

    expect(conversationFlowService.planReply).toHaveBeenCalledWith({
      conversationId: normalizedMessage.fromPhone,
      inboundMessageId: normalizedMessage.externalMessageId,
      inboundBody: 'Hola, quiero saber si me pueden ayudar',
      channel: 'whatsapp',
    });
  });

  it('increments off-flow count and sends bounded guidance for unrelated INFO_SERVICES replies', async () => {
    repository.loadState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.INFO_SERVICES,
      offFlowCount: 0,
      expiresAt: new Date('2099-03-24T15:00:00.000Z'),
    });
    repository.saveState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.INFO_SERVICES,
      offFlowCount: 1,
      metadata: { topic: 'services_overview' },
    });

    await expect(
      service.handleInbound({
        ...normalizedMessage,
        body: 'jajaja',
      }),
    ).resolves.toMatchObject({
      nextState: BotConversationState.INFO_SERVICES,
      outbound: {
        kind: 'text',
        body: expect.stringContaining('jajaja'),
      },
    });

    expect(repository.saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        state: BotConversationState.INFO_SERVICES,
        offFlowCount: 1,
      }),
      BOT_CONVERSATION_TTL_SECONDS,
    );
  });

  it('escalates to HUMAN_HANDOFF after the third consecutive off-flow attempt', async () => {
    repository.loadState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.INFO_SERVICES,
      offFlowCount: 2,
      expiresAt: new Date('2099-03-24T15:00:00.000Z'),
    });
    repository.saveState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.HUMAN_HANDOFF,
      offFlowCount: 3,
      metadata: { ownerNotified: true },
    });

    await expect(
      service.handleInbound({
        ...normalizedMessage,
        body: 'no entiendo',
      }),
    ).resolves.toMatchObject({
      nextState: BotConversationState.HUMAN_HANDOFF,
      outbound: {
        kind: 'text',
        body: expect.stringContaining('asesor'),
      },
    });

    expect(humanHandoffService.notifyOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: normalizedMessage.fromPhone,
        inboundMessageId: normalizedMessage.externalMessageId,
        customerMessageBody: 'no entiendo',
      }),
    );
    expect(repository.saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        state: BotConversationState.HUMAN_HANDOFF,
        offFlowCount: 3,
      }),
      BOT_CONVERSATION_TTL_SECONDS,
    );
  });

  it('replies to media in QUALIFYING with text-only guidance and keeps the flow active', async () => {
    repository.loadState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.QUALIFYING,
      offFlowCount: 0,
      expiresAt: new Date('2099-03-24T15:00:00.000Z'),
    });
    repository.saveState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.QUALIFYING,
      offFlowCount: 1,
      metadata: { delegatedToAiSales: true },
    });

    await expect(
      service.handleInbound({
        ...normalizedMessage,
        body: null,
        messageType: 'image',
      }),
    ).resolves.toMatchObject({
      nextState: BotConversationState.QUALIFYING,
      outbound: {
        kind: 'text',
        body: expect.stringContaining('solo procesamos mensajes de texto'),
      },
    });

    expect(conversationFlowService.planReply).not.toHaveBeenCalled();
    expect(repository.saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        state: BotConversationState.QUALIFYING,
        offFlowCount: 1,
      }),
      BOT_CONVERSATION_TTL_SECONDS,
    );
  });

  it('re-greets expired conversations with the returning-contact variant', async () => {
    repository.loadState.mockResolvedValue(null);
    repository.rebuildState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.QUALIFYING,
      offFlowCount: 2,
      lastInboundMessageId: 'msg_previous',
      expiresAt: new Date('2026-03-22T15:00:00.000Z'),
    });
    repository.saveState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.GREETING,
      metadata: { greetingVariant: 'returning_contact' },
    });

    await expect(service.handleInbound(normalizedMessage)).resolves.toMatchObject({
      nextState: BotConversationState.GREETING,
      outbound: {
        kind: 'interactive-buttons',
        body: expect.stringContaining('Hola de nuevo'),
      },
    });

    expect(repository.saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: normalizedMessage.fromPhone,
        state: BotConversationState.GREETING,
        metadata: { greetingVariant: 'returning_contact' },
        offFlowCount: 0,
        lastInboundMessageId: normalizedMessage.externalMessageId,
      }),
      BOT_CONVERSATION_TTL_SECONDS,
    );
  });
});
