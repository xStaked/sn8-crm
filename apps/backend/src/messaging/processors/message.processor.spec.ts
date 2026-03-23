import { MessageProcessor } from './message.processor';

describe('MessageProcessor', () => {
  const payload = { message: { id: 'msg_1' } };
  const normalizedMessage = {
    externalMessageId: 'msg_1',
    direction: 'inbound',
    fromPhone: '573001112233',
    toPhone: '573004445566',
    body: 'hola',
    messageType: 'text',
    interactiveReply: null,
    channel: 'whatsapp',
    rawPayload: payload,
  };

  let prisma: { message: { create: jest.Mock } };
  let channel: { normalizeInbound: jest.Mock };
  let messagingService: { sendText: jest.Mock; sendInteractiveButtons: jest.Mock };
  let botConversationService: { handleInbound: jest.Mock };
  let config: { get: jest.Mock };
  let processor: MessageProcessor;

  beforeEach(() => {
    prisma = {
      message: {
        create: jest.fn(),
      },
    };

    channel = {
      normalizeInbound: jest.fn(),
    };

    messagingService = {
      sendText: jest.fn().mockResolvedValue('out_1'),
      sendInteractiveButtons: jest.fn().mockResolvedValue('out_interactive_1'),
    };

    botConversationService = {
      handleInbound: jest.fn().mockResolvedValue({
        nextState: 'QUALIFYING',
        outbound: {
          kind: 'text',
          body: 'Respuesta dinamica del flujo comercial.',
          source: 'commercial-discovery',
        },
      }),
    };

    config = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'DEFAULT_AUTO_REPLY_MESSAGE':
            return undefined;
          case 'KAPSO_PHONE_NUMBER_ID':
            return 'phone_number_id_123';
          case 'AI_SALES_OWNER_PHONE':
            return '+573009998887';
          default:
            return undefined;
        }
      }),
    };

    processor = new MessageProcessor(
      prisma as any,
      channel as any,
      messagingService as any,
      config as any,
      botConversationService as any,
    );
  });

  it('normalizes raw payload and persists Message via Prisma', async () => {
    channel.normalizeInbound.mockReturnValue(normalizedMessage);
    prisma.message.create
      .mockResolvedValueOnce({ id: 'db_1' })
      .mockResolvedValueOnce({ id: 'db_2' });

    await expect(processor.process({ data: { payload } } as any)).resolves.toBeUndefined();

    expect(channel.normalizeInbound).toHaveBeenCalledWith(payload);
    expect(prisma.message.create).toHaveBeenNthCalledWith(1, {
      data: {
        externalMessageId: 'msg_1',
        direction: 'inbound',
        fromPhone: '573001112233',
        toPhone: '573004445566',
        body: 'hola',
        channel: 'whatsapp',
        rawPayload: payload,
      },
    });
    expect(botConversationService.handleInbound).toHaveBeenCalledWith(normalizedMessage);
    expect(messagingService.sendText).toHaveBeenCalledWith(
      '573001112233',
      'Respuesta dinamica del flujo comercial.',
      'phone_number_id_123',
    );
    expect(prisma.message.create).toHaveBeenNthCalledWith(2, {
      data: {
        externalMessageId: 'out_1',
        direction: 'outbound',
        fromPhone: 'phone_number_id_123',
        toPhone: '573001112233',
        body: 'Respuesta dinamica del flujo comercial.',
        channel: 'whatsapp',
        rawPayload: {
          externalMessageId: 'out_1',
          direction: 'outbound',
          fromPhone: 'phone_number_id_123',
          toPhone: '573001112233',
          body: 'Respuesta dinamica del flujo comercial.',
          source: 'commercial-discovery',
          kind: 'text',
          state: 'QUALIFYING',
          replyToExternalMessageId: 'msg_1',
        },
      },
    });
  });

  it('falls back to the inbound payload when normalized rawPayload is missing', async () => {
    channel.normalizeInbound.mockReturnValue({
      ...normalizedMessage,
      rawPayload: undefined,
    });
    prisma.message.create
      .mockResolvedValueOnce({ id: 'db_1' })
      .mockResolvedValueOnce({ id: 'db_2' });

    await expect(processor.process({ data: { payload } } as any)).resolves.toBeUndefined();

    expect(prisma.message.create).toHaveBeenNthCalledWith(1, {
      data: {
        externalMessageId: 'msg_1',
        direction: 'inbound',
        fromPhone: '573001112233',
        toPhone: '573004445566',
        body: 'hola',
        channel: 'whatsapp',
        rawPayload: payload,
      },
    });
  });

  it('treats Prisma P2002 duplicates as success', async () => {
    channel.normalizeInbound.mockReturnValue({
      ...normalizedMessage,
      body: null,
    });
    prisma.message.create.mockRejectedValue({ code: 'P2002' });

    await expect(processor.process({ data: { payload } } as any)).resolves.toBeUndefined();
    expect(messagingService.sendText).not.toHaveBeenCalled();
  });

  it('keeps a single durable message row when the same externalMessageId is delivered twice', async () => {
    const persistedRows: Array<{ externalMessageId: string; rawPayload: unknown }> = [];
    channel.normalizeInbound.mockReturnValue(normalizedMessage);
    prisma.message.create.mockImplementation(async ({ data }) => {
      const duplicate = persistedRows.find(
        (row) => row.externalMessageId === data.externalMessageId,
      );

      if (duplicate) {
        throw { code: 'P2002' };
      }

      persistedRows.push({
        externalMessageId: data.externalMessageId,
        rawPayload: data.rawPayload,
      });
      return { id: `db_${persistedRows.length}` };
    });

    await expect(processor.process({ data: { payload } } as any)).resolves.toBeUndefined();
    await expect(processor.process({ data: { payload } } as any)).resolves.toBeUndefined();

    expect(prisma.message.create).toHaveBeenCalledTimes(3);
    expect(persistedRows).toEqual([
      {
        externalMessageId: 'msg_1',
        rawPayload: payload,
      },
      {
        externalMessageId: 'out_1',
        rawPayload: {
          externalMessageId: 'out_1',
          direction: 'outbound',
          fromPhone: 'phone_number_id_123',
          toPhone: '573001112233',
          body: 'Respuesta dinamica del flujo comercial.',
          source: 'commercial-discovery',
          kind: 'text',
          state: 'QUALIFYING',
          buttons: undefined,
          replyToExternalMessageId: 'msg_1',
        },
      },
    ]);
  });

  it('rethrows non-idempotency persistence errors so BullMQ can retry', async () => {
    channel.normalizeInbound.mockReturnValue({
      ...normalizedMessage,
      body: null,
    });
    const err = new Error('db down');
    prisma.message.create.mockRejectedValue(err);

    await expect(processor.process({ data: { payload } } as any)).rejects.toBe(err);
  });

  it('does not auto-reply to owner approval commands', async () => {
    channel.normalizeInbound.mockReturnValue({
      ...normalizedMessage,
      fromPhone: '573009998887',
      body: 'SN8 APPROVE 573001112233 v1',
    });
    prisma.message.create.mockResolvedValueOnce({ id: 'db_1' });

    await expect(processor.process({ data: { payload } } as any)).resolves.toBeUndefined();

    expect(botConversationService.handleInbound).not.toHaveBeenCalled();
    expect(messagingService.sendText).not.toHaveBeenCalled();
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
  });

  it('still auto-replies to normal messages even when they come from the configured owner phone', async () => {
    channel.normalizeInbound.mockReturnValue({
      ...normalizedMessage,
      fromPhone: '573009998887',
      body: 'respondeme bro',
    });
    prisma.message.create
      .mockResolvedValueOnce({ id: 'db_1' })
      .mockResolvedValueOnce({ id: 'db_2' });

    await expect(processor.process({ data: { payload } } as any)).resolves.toBeUndefined();

    expect(botConversationService.handleInbound).toHaveBeenCalledWith({
      ...normalizedMessage,
      fromPhone: '573009998887',
      body: 'respondeme bro',
    });
    expect(messagingService.sendText).toHaveBeenCalledWith(
      '573009998887',
      'Respuesta dinamica del flujo comercial.',
      'phone_number_id_123',
    );
  });

  it('lets inbound media reach the FSM fallback path instead of dropping it silently', async () => {
    channel.normalizeInbound.mockReturnValue({
      ...normalizedMessage,
      body: null,
      messageType: 'image',
    });
    prisma.message.create
      .mockResolvedValueOnce({ id: 'db_1' })
      .mockResolvedValueOnce({ id: 'db_2' });
    botConversationService.handleInbound.mockResolvedValue({
      nextState: 'QUALIFYING',
      outbound: {
        kind: 'text',
        body: 'Por ahora solo procesamos mensajes de texto. Cuéntame por escrito qué necesitas.',
        source: 'bot-media-fallback',
      },
    });

    await expect(processor.process({ data: { payload } } as any)).resolves.toBeUndefined();

    expect(botConversationService.handleInbound).toHaveBeenCalledWith({
      ...normalizedMessage,
      body: null,
      messageType: 'image',
    });
    expect(messagingService.sendText).toHaveBeenCalledWith(
      '573001112233',
      'Por ahora solo procesamos mensajes de texto. Cuéntame por escrito qué necesitas.',
      'phone_number_id_123',
    );
  });

  it('sends interactive button replies when the bot-conversation service requests them', async () => {
    channel.normalizeInbound.mockReturnValue(normalizedMessage);
    prisma.message.create
      .mockResolvedValueOnce({ id: 'db_1' })
      .mockResolvedValueOnce({ id: 'db_2' });
    botConversationService.handleInbound.mockResolvedValue({
      nextState: 'GREETING',
      outbound: {
        kind: 'interactive-buttons',
        body: 'Hola de nuevo. Elige una opcion.',
        buttons: [
          { id: 'QUOTE_PROJECT', title: 'Cotizar proyecto' },
          { id: 'INFO_SERVICES', title: 'Conocer servicios' },
          { id: 'HUMAN_HANDOFF', title: 'Hablar con alguien' },
        ],
        source: 'bot-greeting',
      },
    });

    await expect(processor.process({ data: { payload } } as any)).resolves.toBeUndefined();

    expect(messagingService.sendInteractiveButtons).toHaveBeenCalledWith(
      '573001112233',
      'Hola de nuevo. Elige una opcion.',
      [
        { id: 'QUOTE_PROJECT', title: 'Cotizar proyecto' },
        { id: 'INFO_SERVICES', title: 'Conocer servicios' },
        { id: 'HUMAN_HANDOFF', title: 'Hablar con alguien' },
      ],
      'phone_number_id_123',
    );
    expect(prisma.message.create).toHaveBeenNthCalledWith(2, {
      data: {
        externalMessageId: 'out_interactive_1',
        direction: 'outbound',
        fromPhone: 'phone_number_id_123',
        toPhone: '573001112233',
        body: 'Hola de nuevo. Elige una opcion.',
        channel: 'whatsapp',
        rawPayload: {
          externalMessageId: 'out_interactive_1',
          direction: 'outbound',
          fromPhone: 'phone_number_id_123',
          toPhone: '573001112233',
          body: 'Hola de nuevo. Elige una opcion.',
          source: 'bot-greeting',
          kind: 'interactive-buttons',
          state: 'GREETING',
          buttons: [
            { id: 'QUOTE_PROJECT', title: 'Cotizar proyecto' },
            { id: 'INFO_SERVICES', title: 'Conocer servicios' },
            { id: 'HUMAN_HANDOFF', title: 'Hablar con alguien' },
          ],
          replyToExternalMessageId: 'msg_1',
        },
      },
    });
  });

  it('persists bot state changes across consecutive inbound turns', async () => {
    const firstTurn = {
      ...normalizedMessage,
      externalMessageId: 'msg_turn_1',
      body: 'Hola',
    };
    const secondTurn = {
      ...normalizedMessage,
      externalMessageId: 'msg_turn_2',
      body: 'Quiero cotizar una automatizacion',
      messageType: 'interactive',
      interactiveReply: {
        id: 'QUOTE_PROJECT',
        title: 'Cotizar proyecto',
      },
    };

    channel.normalizeInbound
      .mockReturnValueOnce(firstTurn)
      .mockReturnValueOnce(secondTurn);
    prisma.message.create
      .mockResolvedValueOnce({ id: 'db_1' })
      .mockResolvedValueOnce({ id: 'db_2' })
      .mockResolvedValueOnce({ id: 'db_3' })
      .mockResolvedValueOnce({ id: 'db_4' });
    messagingService.sendInteractiveButtons.mockResolvedValueOnce('out_turn_1');
    messagingService.sendText.mockResolvedValueOnce('out_turn_2');
    botConversationService.handleInbound
      .mockResolvedValueOnce({
        nextState: 'GREETING',
        outbound: {
          kind: 'interactive-buttons',
          body: 'Hola de nuevo. Elige una opcion.',
          buttons: [
            { id: 'QUOTE_PROJECT', title: 'Cotizar proyecto' },
            { id: 'INFO_SERVICES', title: 'Conocer servicios' },
            { id: 'HUMAN_HANDOFF', title: 'Hablar con alguien' },
          ],
          source: 'bot-greeting',
        },
      })
      .mockResolvedValueOnce({
        nextState: 'QUALIFYING',
        outbound: {
          kind: 'text',
          body: 'Cuéntame qué quieres construir.',
          source: 'commercial-discovery',
        },
      });

    await expect(processor.process({ data: { payload } } as any)).resolves.toBeUndefined();
    await expect(processor.process({ data: { payload } } as any)).resolves.toBeUndefined();

    expect(botConversationService.handleInbound).toHaveBeenNthCalledWith(1, firstTurn);
    expect(botConversationService.handleInbound).toHaveBeenNthCalledWith(2, secondTurn);
    expect(prisma.message.create).toHaveBeenNthCalledWith(4, {
      data: {
        externalMessageId: 'out_turn_2',
        direction: 'outbound',
        fromPhone: 'phone_number_id_123',
        toPhone: '573001112233',
        body: 'Cuéntame qué quieres construir.',
        channel: 'whatsapp',
        rawPayload: {
          externalMessageId: 'out_turn_2',
          direction: 'outbound',
          fromPhone: 'phone_number_id_123',
          toPhone: '573001112233',
          body: 'Cuéntame qué quieres construir.',
          source: 'commercial-discovery',
          kind: 'text',
          state: 'QUALIFYING',
          buttons: undefined,
          replyToExternalMessageId: 'msg_turn_2',
        },
      },
    });
  });
});
