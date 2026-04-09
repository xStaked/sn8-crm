export const SALES_GRAPH_NODES = {
  loadContext: 'load_context',
  classifyIntent: 'classify_intent',
  handleNewProject: 'handle_new_project',
  runDiscoveryExtraction: 'run_discovery_extraction',
  evaluateBriefReadiness: 'evaluate_brief_readiness',
  askDiscoveryQuestion: 'ask_discovery_question',
  enqueueQuoteGeneration: 'enqueue_quote_generation',
  requestOwnerReview: 'request_owner_review',
  replyReviewStatus: 'reply_review_status',
  handleDeliveredQuote: 'handle_delivered_quote',
  humanHandoff: 'human_handoff',
  finalizeReply: 'finalize_reply',
  persistCheckpoint: 'persist_checkpoint',
} as const;

export type SalesGraphNode = (typeof SALES_GRAPH_NODES)[keyof typeof SALES_GRAPH_NODES];

export const SALES_GRAPH_INTERRUPTABLE_NODES = new Set<SalesGraphNode>([
  SALES_GRAPH_NODES.enqueueQuoteGeneration,
  SALES_GRAPH_NODES.requestOwnerReview,
  SALES_GRAPH_NODES.humanHandoff,
]);
