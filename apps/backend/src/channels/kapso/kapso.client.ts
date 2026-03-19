import { buildTemplateSendPayload, WhatsAppClient } from '@kapso/whatsapp-cloud-api';
import { Injectable } from '@nestjs/common';
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

  async sendText(to: string, body: string): Promise<void> {
    const { client, phoneNumberId } = this.assertConfigured();
    await client.messages.sendText({ phoneNumberId, to, body });
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

