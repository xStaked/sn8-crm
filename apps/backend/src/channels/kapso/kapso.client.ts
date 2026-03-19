import { buildTemplateSendPayload, WhatsAppClient } from '@kapso/whatsapp-cloud-api';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type KapsoOutboundConfig = {
  apiKey: string;
  phoneNumberId: string;
};

@Injectable()
export class KapsoClient {
  private readonly client: WhatsAppClient | null;
  private readonly cfg: KapsoOutboundConfig | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('KAPSO_API_KEY') ?? '';
    const phoneNumberId = this.config.get<string>('KAPSO_PHONE_NUMBER_ID') ?? '';

    if (!apiKey || !phoneNumberId) {
      this.client = null;
      this.cfg = null;
      return;
    }

    this.client = new WhatsAppClient({
      baseUrl: 'https://api.kapso.ai/meta/whatsapp',
      kapsoApiKey: apiKey,
    });
    this.cfg = { apiKey, phoneNumberId };
  }

  private assertConfigured(): { client: WhatsAppClient; phoneNumberId: string } {
    if (!this.client || !this.cfg) {
      throw new Error(
        'KapsoClient is not configured. Set KAPSO_API_KEY and KAPSO_PHONE_NUMBER_ID.',
      );
    }
    return { client: this.client, phoneNumberId: this.cfg.phoneNumberId };
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

  async sendText(to: string, body: string): Promise<string> {
    const { client, phoneNumberId } = this.assertConfigured();

    try {
      const response = await client.messages.sendText({ phoneNumberId, to, body });
      return response.messages[0].id;
    } catch (error) {
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
}
