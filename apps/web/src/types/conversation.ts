export type Conversation = {
  id: string;
  contactName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

export type ConversationSummaryDto = Conversation;

export type ConversationListState =
  | "loading"
  | "ready"
  | "empty"
  | "unauthorized"
  | "error";

export type ConversationMessage = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  body: string | null;
  createdAt: string;
};

export type ConversationMessageDto = ConversationMessage;

export type ConversationMessageState =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "unauthorized"
  | "error";
