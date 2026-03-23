export type NormalizedMessageType =
  | 'text'
  | 'interactive'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'unknown';

export interface InteractiveReplySelection {
  id: string;
  title: string;
}

export interface NormalizedMessage {
  externalMessageId: string;
  direction: 'inbound' | 'outbound';
  fromPhone: string;
  toPhone: string;
  body: string | null;
  messageType: NormalizedMessageType;
  interactiveReply: InteractiveReplySelection | null;
  channel: string;
  rawPayload: unknown;
}
