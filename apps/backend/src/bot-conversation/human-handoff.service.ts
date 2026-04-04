import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';

export type HumanHandoffNotificationInput = {
  conversationId: string;
  inboundMessageId: string;
  customerMessageBody: string | null;
};

@Injectable()
export class HumanHandoffService {
  private readonly logger = new Logger(HumanHandoffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingService: MessagingService,
    private readonly config: ConfigService,
  ) {}

  async notifyOwner(input: HumanHandoffNotificationInput): Promise<void> {
    const ownerPhone = this.getOwnerPhone();
    if (!ownerPhone) {
      this.logger.warn({
        event: 'human_handoff_whatsapp_notification_skipped',
        conversationId: input.conversationId,
        inboundMessageId: input.inboundMessageId,
        reason: 'missing_ai_sales_owner_phone',
        message:
          'Human handoff remains managed in CRM; legacy owner WhatsApp notification was skipped because AI_SALES_OWNER_PHONE is not configured.',
      });
      return;
    }

    const senderPhoneNumberId =
      this.config.get<string>('KAPSO_PHONE_NUMBER_ID')?.trim() || undefined;
    const body = this.buildOwnerNotificationMessage(input);
    const externalMessageId = await this.messagingService.sendText(
      ownerPhone,
      body,
      senderPhoneNumberId,
    );

    await this.prisma.message.create({
      data: {
        externalMessageId,
        direction: 'outbound',
        fromPhone: senderPhoneNumberId ?? 'bot-human-handoff',
        toPhone: ownerPhone,
        body,
        channel: 'whatsapp',
        rawPayload: {
          externalMessageId,
          direction: 'outbound',
          fromPhone: senderPhoneNumberId ?? 'bot-human-handoff',
          toPhone: ownerPhone,
          body,
          source: 'bot-human-handoff',
          conversationId: input.conversationId,
          inboundMessageId: input.inboundMessageId,
          customerMessageBody: input.customerMessageBody,
        },
      },
    });
  }

  private getOwnerPhone(): string | null {
    return this.config.get<string>('AI_SALES_OWNER_PHONE')?.trim() ?? null;
  }

  private buildOwnerNotificationMessage(input: HumanHandoffNotificationInput): string {
    const customerContext = input.customerMessageBody?.trim()
      ? `Mensaje del cliente: "${input.customerMessageBody.trim()}".`
      : 'El cliente solicito hablar con alguien.';

    return `Nuevo handoff humano solicitado para ${input.conversationId}. ${customerContext} Respondele por WhatsApp cuanto antes.`;
  }
}
