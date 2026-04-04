import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanHandoffService } from './human-handoff.service';

describe('HumanHandoffService', () => {
  let prisma: { message: { create: jest.Mock } };
  let messagingService: { sendText: jest.Mock };
  let config: ConfigService;
  let service: HumanHandoffService;

  beforeEach(() => {
    prisma = {
      message: {
        create: jest.fn(),
      },
    };

    messagingService = {
      sendText: jest.fn().mockResolvedValue('out_handoff_1'),
    };

    config = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'AI_SALES_OWNER_PHONE':
            return '+573009998887';
          case 'KAPSO_PHONE_NUMBER_ID':
            return 'kapso-phone-id';
          default:
            return undefined;
        }
      }),
    } as unknown as ConfigService;

    service = new HumanHandoffService(
      prisma as any,
      messagingService as any,
      config,
    );
  });

  it('sends a WhatsApp notification to the owner when configured', async () => {
    await service.notifyOwner({
      conversationId: '573001112233',
      inboundMessageId: 'wamid.123',
      customerMessageBody: 'quiero hablar con alguien',
    });

    expect(messagingService.sendText).toHaveBeenCalledWith(
      '+573009998887',
      expect.stringContaining('Nuevo handoff humano solicitado para 573001112233'),
      'kapso-phone-id',
    );
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toPhone: '+573009998887',
          rawPayload: expect.objectContaining({
            source: 'bot-human-handoff',
            conversationId: '573001112233',
            inboundMessageId: 'wamid.123',
          }),
        }),
      }),
    );
  });

  it('skips legacy owner WhatsApp notification when AI_SALES_OWNER_PHONE is missing', async () => {
    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      if (key === 'AI_SALES_OWNER_PHONE') {
        return undefined as never;
      }

      if (key === 'KAPSO_PHONE_NUMBER_ID') {
        return 'kapso-phone-id' as never;
      }

      return undefined as never;
    });
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await expect(
      service.notifyOwner({
        conversationId: '573001112233',
        inboundMessageId: 'wamid.123',
        customerMessageBody: 'quiero hablar con alguien',
      }),
    ).resolves.toBeUndefined();

    expect(messagingService.sendText).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'human_handoff_whatsapp_notification_skipped',
        conversationId: '573001112233',
        inboundMessageId: 'wamid.123',
        reason: 'missing_ai_sales_owner_phone',
      }),
    );
  });
});
