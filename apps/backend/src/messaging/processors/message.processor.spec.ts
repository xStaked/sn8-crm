import { MessageProcessor } from './message.processor';

describe('MessageProcessor', () => {
  const payload = { message: { id: 'msg_1' } };
  const normalizedMessage = {
    externalMessageId: 'msg_1',
    direction: 'inbound',
    fromPhone: '573001112233',
    toPhone: '573004445566',
    body: 'hola',
    channel: 'whatsapp',
    rawPayload: payload,
  };

  let prisma: { message: { create: jest.Mock } };
  let channel: { normalizeInbound: jest.Mock };
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

    processor = new MessageProcessor(prisma as any, channel as any);
  });

  it('normalizes raw payload and persists Message via Prisma', async () => {
    channel.normalizeInbound.mockReturnValue(normalizedMessage);
    prisma.message.create.mockResolvedValue({ id: 'db_1' });

    await expect(processor.process({ data: { payload } } as any)).resolves.toBeUndefined();

    expect(channel.normalizeInbound).toHaveBeenCalledWith(payload);
    expect(prisma.message.create).toHaveBeenCalledWith({
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

  it('falls back to the inbound payload when normalized rawPayload is missing', async () => {
    channel.normalizeInbound.mockReturnValue({
      ...normalizedMessage,
      rawPayload: undefined,
    });
    prisma.message.create.mockResolvedValue({ id: 'db_1' });

    await expect(processor.process({ data: { payload } } as any)).resolves.toBeUndefined();

    expect(prisma.message.create).toHaveBeenCalledWith({
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

    expect(prisma.message.create).toHaveBeenCalledTimes(2);
    expect(persistedRows).toEqual([
      {
        externalMessageId: 'msg_1',
        rawPayload: payload,
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
});
