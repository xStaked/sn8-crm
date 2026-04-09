import { Annotation } from '@langchain/langgraph';
import type {
  SalesChannel,
  SalesGraphBriefStatus,
  SalesGraphIntent,
  SalesGraphQuoteReviewStatus,
} from './sales-graph.types';

export const SalesGraphAnnotation = Annotation.Root({
  conversationId: Annotation<string>(),
  inboundMessageId: Annotation<string>(),
  inboundBody: Annotation<string | null>(),
  channel: Annotation<SalesChannel>(),
  intent: Annotation<SalesGraphIntent>({
    default: () => 'unknown' as SalesGraphIntent,
    reducer: (_, update) => update,
  }),
  transcript: Annotation<string>({
    default: () => '',
    reducer: (_, update) => update,
  }),
  briefId: Annotation<string | undefined>({
    reducer: (_, update) => update,
  }),
  briefStatus: Annotation<SalesGraphBriefStatus | undefined>({
    reducer: (_, update) => update,
  }),
  briefSummary: Annotation<string | undefined>({
    reducer: (_, update) => update,
  }),
  missingFields: Annotation<string[]>({
    default: () => [],
    reducer: (_, update) => update,
  }),
  quoteDraftId: Annotation<string | undefined>({
    reducer: (_, update) => update,
  }),
  quoteDraftVersion: Annotation<number | undefined>({
    reducer: (_, update) => update,
  }),
  quoteReviewStatus: Annotation<SalesGraphQuoteReviewStatus | undefined>({
    reducer: (_, update) => update,
  }),
  escalationReason: Annotation<string | undefined>({
    reducer: (_, update) => update,
  }),
  shouldNotifyHuman: Annotation<boolean>({
    default: () => false,
    reducer: (_, update) => update,
  }),
  responseBody: Annotation<string | undefined>({
    reducer: (_, update) => update,
  }),
  responseSource: Annotation<string | undefined>({
    reducer: (_, update) => update,
  }),
  newProjectStartMessageId: Annotation<string | undefined>({
    reducer: (_, update) => update,
  }),
  retries: Annotation<Record<string, number>>({
    default: () => ({}),
    reducer: (existing, update) => ({ ...existing, ...update }),
  }),
  lastError: Annotation<string | undefined>({
    reducer: (_, update) => update,
  }),
  traceId: Annotation<string>({
    default: () => '',
    reducer: (_, update) => update,
  }),
  startedAt: Annotation<string>({
    default: () => new Date().toISOString(),
    reducer: (_, update) => update,
  }),
});

export type SalesGraphStateType = typeof SalesGraphAnnotation.State;
