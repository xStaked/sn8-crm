import { describe, expect, it, jest } from '@jest/globals';
import { ChannelAdapter } from '../channels/channel.adapter';
import { MessagingService } from './messaging.service';

describe('MessagingService', () => {
  it('sendText() forwards recipient + body to ChannelAdapter.sendText()', async () => {
    const channel = {
      sendText: jest.fn(async () => undefined),
      sendTemplate: jest.fn(async () => undefined),
      normalizeInbound: jest.fn(() => {
        throw new Error('not used');
      }),
    } as unknown as ChannelAdapter;

    const service = new MessagingService(channel);
    await service.sendText('+15551234567', 'Hello');

    expect(channel.sendText).toHaveBeenCalledWith('+15551234567', 'Hello');
  });

  it('sendTemplate() forwards template name + params to ChannelAdapter.sendTemplate()', async () => {
    const channel = {
      sendText: jest.fn(async () => undefined),
      sendTemplate: jest.fn(async () => undefined),
      normalizeInbound: jest.fn(() => {
        throw new Error('not used');
      }),
    } as unknown as ChannelAdapter;

    const service = new MessagingService(channel);
    await service.sendTemplate('+15551234567', 'seasonal_promo', ['Aug 31', 'SALE25']);

    expect(channel.sendTemplate).toHaveBeenCalledWith(
      '+15551234567',
      'seasonal_promo',
      ['Aug 31', 'SALE25'],
    );
  });
});

