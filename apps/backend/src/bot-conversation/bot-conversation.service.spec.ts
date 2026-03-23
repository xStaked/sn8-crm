import { BotConversationRepository } from './bot-conversation.repository';
import {
  BOT_CONVERSATION_TTL_SECONDS,
  BotConversationState,
  type BotConversationSnapshot,
  BotConversationService,
} from './bot-conversation.service';

describe('BotConversationService', () => {
  let repository: jest.Mocked<BotConversationRepository>;
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

  beforeEach(() => {
    repository = {
      loadState: jest.fn(),
      saveState: jest.fn(),
      rebuildState: jest.fn(),
    } as unknown as jest.Mocked<BotConversationRepository>;

    service = new BotConversationService(repository);
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
});
