import { Injectable } from '@nestjs/common';
import { ChannelAdapter } from '../channels/channel.adapter';

@Injectable()
export class MessagingService {
  constructor(private readonly channel: ChannelAdapter) {}

  async sendText(to: string, body: string): Promise<string> {
    return this.channel.sendText(to, body);
  }

  async sendTemplate(
    to: string,
    templateName: string,
    params: string[],
  ): Promise<void> {
    await this.channel.sendTemplate(to, templateName, params);
  }
}
