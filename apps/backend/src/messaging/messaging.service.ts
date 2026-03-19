import { Injectable } from '@nestjs/common';
import { ChannelAdapter } from '../channels/channel.adapter';

@Injectable()
export class MessagingService {
  constructor(private readonly channel: ChannelAdapter) {}

  async sendText(
    to: string,
    body: string,
    senderPhoneNumberId?: string,
  ): Promise<string> {
    return this.channel.sendText(to, body, senderPhoneNumberId);
  }

  async sendTemplate(
    to: string,
    templateName: string,
    params: string[],
  ): Promise<void> {
    await this.channel.sendTemplate(to, templateName, params);
  }
}
