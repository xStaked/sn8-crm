import { ConversationFlowService } from '../ai-sales/conversation-flow.service';
import type { NormalizedMessage } from '../channels/channel.adapter';
import { BotConversationRepository } from './bot-conversation.repository';
import { HumanHandoffService } from './human-handoff.service';
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
  let service: BotConversationService;

  const snapshot: BotConversationSnapshot = {
    conversationId: '573001112233',
    state: BotConversationState.GREETING,
    metadata: { source: 'test' },
    offFlowCount: 1,
    lastInboundMessageId: 'msg_1',
    lastTransitionAt: new Date('2026-03-23T15:00:00.000Z'),
    expiresAt: new Date('2026-03-24T15:00:00.000Z'),
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

    service = new BotConversationService(
      repository,
      conversationFlowService as unknown as ConversationFlowService,
      humanHandoffService as unknown as HumanHandoffService,
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
    });
  });

  it('re-greets expired conversations with the returning-contact variant', async () => {
    repository.loadState.mockResolvedValue({
      ...snapshot,
      state: BotConversationState.QUALIFYING,
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
  });
});
