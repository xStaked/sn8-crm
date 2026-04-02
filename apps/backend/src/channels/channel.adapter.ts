import type { NormalizedMessage } from './kapso/normalized-message.interface';

export type { NormalizedMessage };
export type InteractiveButton = {
  id: string;
  title: string;
};

/**
 * Stable outbound + normalization contract for messaging channels.
 *
 * This is intentionally minimal: later phases can extend the abstraction
 * without coupling business logic to a specific provider SDK.
 */
export abstract class ChannelAdapter {
  abstract sendText(
    to: string,
    body: string,
    senderPhoneNumberId?: string,
  ): Promise<string>;

  abstract sendTemplate(
    to: string,
    templateName: string,
    params: string[],
  ): Promise<void>;

  abstract sendInteractiveButtons(
    to: string,
    body: string,
    buttons: InteractiveButton[],
    senderPhoneNumberId?: string,
  ): Promise<string>;

  abstract sendDocument(
    to: string,
    buffer: Buffer,
    fileName: string,
    caption?: string,
    senderPhoneNumberId?: string,
  ): Promise<string>;

  abstract normalizeInbound(rawPayload: unknown): NormalizedMessage;
}
