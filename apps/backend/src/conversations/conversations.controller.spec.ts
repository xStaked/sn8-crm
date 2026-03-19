import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

describe('ConversationsController', () => {
  let controller: ConversationsController;
  let service: {
    listConversations: jest.Mock;
    listConversationMessages: jest.Mock;
  };

  beforeEach(() => {
    service = {
      listConversations: jest.fn(),
      listConversationMessages: jest.fn(),
    };

    controller = new ConversationsController(
      service as unknown as ConversationsService,
    );
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
});
