export interface NormalizedMessage {
  externalMessageId: string;
  direction: 'inbound' | 'outbound';
  fromPhone: string;
  toPhone: string;
  body: string | null;
  channel: string;
  rawPayload: unknown;
}

