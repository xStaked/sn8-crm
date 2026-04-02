import { Injectable } from '@nestjs/common';
import {
  ChannelAdapter,
  type InteractiveButton,
  NormalizedMessage,
} from '../channel.adapter';
import { KapsoClient } from './kapso.client';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toMessageType(value: unknown): NormalizedMessage['messageType'] {
  if (!isNonEmptyString(value)) {
    return 'unknown';
  }

  switch (value) {
    case 'text':
    case 'interactive':
    case 'image':
    case 'audio':
    case 'video':
    case 'document':
    case 'sticker':
    case 'location':
    case 'contacts':
      return value;
    default:
      return 'unknown';
  }
}

function extractInteractiveReply(
  message: Record<string, unknown>,
): NormalizedMessage['interactiveReply'] {
  const interactive = isRecord(message.interactive) ? message.interactive : undefined;
  if (!interactive) {
    return null;
  }

  const buttonReply = isRecord(interactive.button_reply) ? interactive.button_reply : undefined;
  if (!buttonReply) {
    return null;
  }

  const id = isNonEmptyString(buttonReply.id) ? buttonReply.id : null;
  const title = isNonEmptyString(buttonReply.title) ? buttonReply.title : null;

  if (!id || !title) {
    return null;
  }

  return { id, title };
}

@Injectable()
export class KapsoAdapter extends ChannelAdapter {
  constructor(private readonly kapso: KapsoClient) {
    super();
  }

  async sendText(
    to: string,
    body: string,
    senderPhoneNumberId?: string,
  ): Promise<string> {
    return this.kapso.sendText(to, body, senderPhoneNumberId);
  }

  async sendTemplate(
    to: string,
    templateName: string,
    params: string[],
  ): Promise<void> {
    await this.kapso.sendTemplate(to, templateName, params);
  }

  async sendInteractiveButtons(
    to: string,
    body: string,
    buttons: InteractiveButton[],
    senderPhoneNumberId?: string,
  ): Promise<string> {
    return this.kapso.sendInteractiveButtons(
      to,
      body,
      buttons,
      senderPhoneNumberId,
    );
  }

  async sendDocument(
    to: string,
    buffer: Buffer,
    fileName: string,
    caption?: string,
    senderPhoneNumberId?: string,
  ): Promise<string> {
    return this.kapso.sendDocument(to, buffer, fileName, caption, senderPhoneNumberId);
  }

  normalizeInbound(rawPayload: unknown): NormalizedMessage {
    // Primary: Meta Cloud API webhook shape (Kapso mirrors this when proxying).
    // https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
    if (isRecord(rawPayload) && Array.isArray(rawPayload.entry)) {
      for (const entry of rawPayload.entry) {
        if (!isRecord(entry) || !Array.isArray(entry.changes)) {
          continue;
        }

        for (const change of entry.changes) {
          const value = isRecord(change) ? change.value : undefined;
          if (!isRecord(value) || !Array.isArray(value.messages)) {
            continue;
          }

          for (const message of value.messages) {
            if (!isRecord(message)) {
              continue;
            }

            const id = isNonEmptyString(message.id) ? message.id : undefined;
            const from = isNonEmptyString(message.from) ? message.from : undefined;
            const metadata = isRecord(value.metadata) ? value.metadata : undefined;
            const toPhone =
              (metadata && isNonEmptyString(metadata.display_phone_number)
                ? metadata.display_phone_number
                : undefined) ??
              (metadata && isNonEmptyString(metadata.phone_number_id)
                ? metadata.phone_number_id
                : '');

            const text = isRecord(message.text) ? message.text : undefined;
            const interactiveReply = extractInteractiveReply(message);
            const messageType = toMessageType(message.type);
            const body =
              (text && typeof text.body === 'string' ? text.body : undefined) ??
              interactiveReply?.title ??
              null;

            if (id && from) {
              return {
                externalMessageId: id,
                direction: 'inbound',
                fromPhone: from,
                toPhone,
                body,
                messageType,
                interactiveReply,
                channel: 'whatsapp',
                rawPayload,
              };
            }
          }
        }
      }
    }

    // Kapso native batch format: { type, batch, data: [...], batch_info }
    if (isRecord(rawPayload) && Array.isArray(rawPayload.data)) {
      for (const item of rawPayload.data) {
        if (!isRecord(item) || !isRecord(item.message)) continue;

        const message = item.message;
        const id = isNonEmptyString(message.id) ? message.id : undefined;
        const from = isNonEmptyString(message.from) ? message.from : undefined;
        const toPhone =
          (isRecord(item.conversation) && isNonEmptyString(item.conversation.phone_number_id)
            ? item.conversation.phone_number_id
            : undefined) ??
          (isNonEmptyString(item.phone_number_id) ? item.phone_number_id : '') ??
          '';
        const body =
          isRecord(message.text) && typeof message.text.body === 'string'
            ? message.text.body
            : isRecord(message.kapso) && typeof message.kapso.content === 'string'
              ? message.kapso.content
              : null;
        const interactiveReply = extractInteractiveReply(message);
        const messageType = toMessageType(message.type);

        if (id && from) {
          return {
            externalMessageId: id,
            direction: 'inbound',
            fromPhone: from,
            toPhone,
            body: body ?? interactiveReply?.title ?? null,
            messageType,
            interactiveReply,
            channel: 'whatsapp',
            rawPayload,
          };
        }
      }
    }

    // Fallback: some Kapso events may flatten the message object.
    if (isRecord(rawPayload) && isRecord(rawPayload.message)) {
      const message = rawPayload.message;
      const id = typeof message.id === 'string' ? message.id : undefined;
      const from = typeof message.from === 'string' ? message.from : undefined;
      const to =
        typeof message.to === 'string'
          ? message.to
          : typeof rawPayload.to === 'string'
            ? rawPayload.to
            : '';
      const body =
        isRecord(message.text) && typeof message.text.body === 'string'
          ? message.text.body
          : typeof message.body === 'string'
            ? message.body
            : null;
      const interactiveReply = extractInteractiveReply(message);
      const messageType = toMessageType(message.type);

      if (id && from) {
        return {
          externalMessageId: id,
          direction: 'inbound',
          fromPhone: from,
          toPhone: to,
          body: body ?? interactiveReply?.title ?? null,
          messageType,
          interactiveReply,
          channel: 'whatsapp',
          rawPayload,
        };
      }
    }

    throw new Error('Unable to normalize inbound Kapso payload');
  }
}
