import { describe, expect, it, jest } from '@jest/globals';
import { KapsoAdapter } from './kapso.adapter';
import { KapsoClient } from './kapso.client';

describe('KapsoAdapter', () => {
  const nestedInboundPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry_1',
        changes: [
          {
            field: 'messages',
            value: {
              statuses: [
                {
                  id: 'status_1',
                  status: 'delivered',
                },
              ],
            },
          },
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '573001112233',
                phone_number_id: 'kapso-phone-id',
              },
              contacts: [
                {
                  profile: { name: 'Test User' },
                  wa_id: '573001234567',
                },
              ],
              messages: [
                {
                  from: '573001234567',
                  id: 'wamid.HBgLN...',
                  text: { body: 'Hola desde Kapso' },
                  timestamp: '1717000000',
                  type: 'text',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const flattenedInboundPayload = {
    message: {
      id: 'flat_msg_1',
      from: '573001234567',
      to: '573001112233',
      type: 'image',
    },
  };

  const interactiveInboundPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry_2',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '573001112233',
                phone_number_id: 'kapso-phone-id',
              },
              messages: [
                {
                  from: '573001234567',
                  id: 'wamid.button.tap',
                  timestamp: '1717001000',
                  type: 'interactive',
                  interactive: {
                    type: 'button_reply',
                    button_reply: {
                      id: 'INFO_SERVICES',
                      title: 'Conocer servicios',
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  it('delegates sendText() to KapsoClient.sendText()', async () => {
    const kapsoClient = {
      sendText: jest.fn(async () => 'wamid.test'),
      sendTemplate: jest.fn(async () => undefined),
    } as unknown as KapsoClient;

    const adapter = new KapsoAdapter(kapsoClient);
    await adapter.sendText('+15551234567', 'Hello');

    expect(kapsoClient.sendText).toHaveBeenCalledWith(
      '+15551234567',
      'Hello',
      undefined,
    );
  });

  it('passes through an explicit sender phone number id for replies', async () => {
    const kapsoClient = {
      sendText: jest.fn(async () => 'wamid.test'),
      sendTemplate: jest.fn(async () => undefined),
    } as unknown as KapsoClient;

    const adapter = new KapsoAdapter(kapsoClient);
    await adapter.sendText('+15551234567', 'Hello', 'phone_number_id_123');

    expect(kapsoClient.sendText).toHaveBeenCalledWith(
      '+15551234567',
      'Hello',
      'phone_number_id_123',
    );
  });

  it('delegates sendTemplate() to KapsoClient.sendTemplate()', async () => {
    const kapsoClient = {
      sendText: jest.fn(async () => 'wamid.test'),
      sendTemplate: jest.fn(async () => undefined),
    } as unknown as KapsoClient;

    const adapter = new KapsoAdapter(kapsoClient);
    await adapter.sendTemplate('+15551234567', 'seasonal_promo', ['Aug 31', 'SALE25']);

    expect(kapsoClient.sendTemplate).toHaveBeenCalledWith(
      '+15551234567',
      'seasonal_promo',
      ['Aug 31', 'SALE25'],
    );
  });

  it('delegates sendInteractiveButtons() to KapsoClient.sendInteractiveButtons()', async () => {
    const kapsoClient = {
      sendText: jest.fn(async () => 'wamid.test'),
      sendTemplate: jest.fn(async () => undefined),
      sendInteractiveButtons: jest.fn(async () => 'wamid.interactive'),
    } as unknown as KapsoClient;

    const adapter = new KapsoAdapter(kapsoClient);
    await adapter.sendInteractiveButtons(
      '+15551234567',
      'Hola, soy SN8 Labs. ¿Cómo te ayudamos?',
      [
        { id: 'QUOTE_PROJECT', title: 'Cotizar proyecto' },
        { id: 'INFO_SERVICES', title: 'Conocer servicios' },
        { id: 'HUMAN_HANDOFF', title: 'Hablar con alguien' },
      ],
      'phone_number_id_123',
    );

    expect(kapsoClient.sendInteractiveButtons).toHaveBeenCalledWith(
      '+15551234567',
      'Hola, soy SN8 Labs. ¿Cómo te ayudamos?',
      [
        { id: 'QUOTE_PROJECT', title: 'Cotizar proyecto' },
        { id: 'INFO_SERVICES', title: 'Conocer servicios' },
        { id: 'HUMAN_HANDOFF', title: 'Hablar con alguien' },
      ],
      'phone_number_id_123',
    );
  });

  it('normalizes a nested Kapso inbound payload from later change entries', () => {
    const kapsoClient = {
      sendText: jest.fn(async () => 'wamid.test'),
      sendTemplate: jest.fn(async () => undefined),
    } as unknown as KapsoClient;

    const adapter = new KapsoAdapter(kapsoClient);

    expect(adapter.normalizeInbound(nestedInboundPayload)).toEqual({
      externalMessageId: 'wamid.HBgLN...',
      direction: 'inbound',
      fromPhone: '573001234567',
      toPhone: '573001112233',
      body: 'Hola desde Kapso',
      messageType: 'text',
      interactiveReply: null,
      channel: 'whatsapp',
      rawPayload: nestedInboundPayload,
    });
  });

  it('normalizes a flattened Kapso inbound payload with a null text body', () => {
    const kapsoClient = {
      sendText: jest.fn(async () => undefined),
      sendTemplate: jest.fn(async () => undefined),
    } as unknown as KapsoClient;

    const adapter = new KapsoAdapter(kapsoClient);

    expect(adapter.normalizeInbound(flattenedInboundPayload)).toEqual({
      externalMessageId: 'flat_msg_1',
      direction: 'inbound',
      fromPhone: '573001234567',
      toPhone: '573001112233',
      body: null,
      messageType: 'image',
      interactiveReply: null,
      channel: 'whatsapp',
      rawPayload: flattenedInboundPayload,
    });
  });

  it('normalizes an interactive button reply with routing metadata', () => {
    const kapsoClient = {
      sendText: jest.fn(async () => undefined),
      sendTemplate: jest.fn(async () => undefined),
    } as unknown as KapsoClient;

    const adapter = new KapsoAdapter(kapsoClient);

    expect(adapter.normalizeInbound(interactiveInboundPayload)).toEqual({
      externalMessageId: 'wamid.button.tap',
      direction: 'inbound',
      fromPhone: '573001234567',
      toPhone: '573001112233',
      body: 'Conocer servicios',
      messageType: 'interactive',
      interactiveReply: {
        id: 'INFO_SERVICES',
        title: 'Conocer servicios',
      },
      channel: 'whatsapp',
      rawPayload: interactiveInboundPayload,
    });
  });
});
