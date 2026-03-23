import { buildTemplateSendPayload, WhatsAppClient } from '@kapso/whatsapp-cloud-api';
import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { InteractiveButton } from '../channel.adapter';

type KapsoOutboundConfig = {
  apiKey: string;
  phoneNumberId: string | null;
};

@Injectable()
export class KapsoClient {
  private readonly client: WhatsAppClient | null;
  private readonly cfg: KapsoOutboundConfig | null;
  private readonly logger = new Logger(KapsoClient.name);

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('KAPSO_API_KEY') ?? '';
    const phoneNumberId = this.config.get<string>('KAPSO_PHONE_NUMBER_ID')?.trim() ?? '';

    if (!apiKey) {
      this.client = null;
      this.cfg = null;
      return;
    }

    this.client = new WhatsAppClient({
      baseUrl: 'https://api.kapso.ai/meta/whatsapp',
      kapsoApiKey: apiKey,
    });
    this.cfg = { apiKey, phoneNumberId: phoneNumberId || null };
  }

  private assertConfigured(senderPhoneNumberId?: string): {
    client: WhatsAppClient;
    phoneNumberId: string;
  } {
    if (!this.client || !this.cfg) {
      throw new Error(
        'KapsoClient is not configured. Set KAPSO_API_KEY and provide a sender phone number id.',
      );
    }

    const phoneNumberId = senderPhoneNumberId?.trim() || this.cfg.phoneNumberId;

    if (!phoneNumberId) {
      throw new Error(
        'KapsoClient is missing a sender phone number id. Set KAPSO_PHONE_NUMBER_ID or derive it from the inbound conversation.',
      );
    }

    return { client: this.client, phoneNumberId };
  }

  private isOutsideWindowError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const maybeError = error as {
      code?: unknown;
      raw?: { error?: unknown };
    };

    return (
      maybeError.code === 422 &&
      typeof maybeError.raw?.error === 'string' &&
      maybeError.raw.error.includes('outside the 24-hour window')
    );
  }

  async sendText(
    to: string,
    body: string,
    senderPhoneNumberId?: string,
  ): Promise<string> {
    const { client, phoneNumberId } = this.assertConfigured(senderPhoneNumberId);
    this.logger.log({
      event: 'kapso_send_text_attempt',
      to,
      senderPhoneNumberId: phoneNumberId,
      senderSource: senderPhoneNumberId?.trim() ? 'conversation-history' : 'config-fallback',
      bodyPreview: body.slice(0, 120),
    });

    try {
      const response = await client.messages.sendText({ phoneNumberId, to, body });
      this.logger.log({
        event: 'kapso_send_text_success',
        to,
        senderPhoneNumberId: phoneNumberId,
        externalMessageId: response.messages[0]?.id ?? null,
      });
      return response.messages[0].id;
    } catch (error) {
      this.logger.error({
        event: 'kapso_send_text_failed',
        to,
        senderPhoneNumberId: phoneNumberId,
        senderSource: senderPhoneNumberId?.trim() ? 'conversation-history' : 'config-fallback',
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
              }
            : String(error),
        raw:
          typeof error === 'object' && error !== null && 'raw' in error
            ? (error as { raw?: unknown }).raw
            : null,
        code:
          typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: unknown }).code
            : null,
      });

      if (this.isOutsideWindowError(error)) {
        throw new UnprocessableEntityException({
          code: 'WHATSAPP_WINDOW_CLOSED',
          message:
            'No puedes enviar mensajes libres fuera de la ventana de 24 horas de WhatsApp. Debes enviar una plantilla para reabrir la conversacion.',
        });
      }

      throw error;
    }
  }

  async sendTemplate(
    to: string,
    templateName: string,
    params: string[],
  ): Promise<void> {
    const { client, phoneNumberId } = this.assertConfigured();

    const template = buildTemplateSendPayload({
      name: templateName,
      language: 'en_US',
      body: params.map((text) => ({ type: 'text', text })),
    });

    await client.messages.sendTemplate({ phoneNumberId, to, template });
  }

  async sendInteractiveButtons(
    to: string,
    body: string,
    buttons: InteractiveButton[],
    senderPhoneNumberId?: string,
  ): Promise<string> {
    const { client, phoneNumberId } = this.assertConfigured(senderPhoneNumberId);

    this.logger.log({
      event: 'kapso_send_interactive_buttons_attempt',
      to,
      senderPhoneNumberId: phoneNumberId,
      senderSource: senderPhoneNumberId?.trim() ? 'conversation-history' : 'config-fallback',
      bodyPreview: body.slice(0, 120),
      buttonIds: buttons.map((button) => button.id),
    });

    const response = await client.messages.sendInteractiveButtons({
      phoneNumberId,
      to,
      bodyText: body,
      buttons,
    });

    this.logger.log({
      event: 'kapso_send_interactive_buttons_success',
      to,
      senderPhoneNumberId: phoneNumberId,
      externalMessageId: response.messages[0]?.id ?? null,
    });

    return response.messages[0]?.id ?? '';
  }
}
