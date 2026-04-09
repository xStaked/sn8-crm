import { SALES_GRAPH_NODES } from './sales-graph.contract';
import { SalesGraphRuntime } from './sales-graph.runtime';
import type { SalesGraphState } from './sales-graph.types';

describe('SalesGraphRuntime', () => {
  let runtime: SalesGraphRuntime;

  const baseState = (): SalesGraphState => ({
    conversationId: '573001112233',
    inboundMessageId: 'msg_1',
    inboundBody: 'hola',
    channel: 'whatsapp',
    intent: 'unknown',
    transcript: '',
    missingFields: [],
    shouldNotifyHuman: false,
    retries: {},
    traceId: 'trace_1',
    startedAt: '2026-04-09T00:00:00.000Z',
  });

  beforeEach(() => {
    runtime = new SalesGraphRuntime();
  });

  it('builds normalized initial state', () => {
    const state = runtime.createInitialState({
      conversationId: ' 573001112233 ',
      inboundMessageId: ' msg_1 ',
      inboundBody: 'hola',
      channel: 'whatsapp',
      traceId: 'trace_1',
      startedAt: '2026-04-09T00:00:00.000Z',
    });

    expect(state).toEqual(
      expect.objectContaining({
        conversationId: '573001112233',
        inboundMessageId: 'msg_1',
        intent: 'unknown',
        missingFields: [],
      }),
    );
  });

  it('routes explicit new project intents to context reset', () => {
    const next = runtime.decideActionNode({
      ...baseState(),
      intent: 'new_project',
    });

    expect(next).toBe(SALES_GRAPH_NODES.handleNewProject);
  });

  it('routes delivered quote state to post-delivery handler', () => {
    const next = runtime.decideActionNode({
      ...baseState(),
      quoteReviewStatus: 'delivered_to_customer',
    });

    expect(next).toBe(SALES_GRAPH_NODES.handleDeliveredQuote);
  });

  it('routes incomplete brief state to discovery question node', () => {
    const next = runtime.decideActionNode({
      ...baseState(),
      briefStatus: 'collecting',
      missingFields: ['businessProblem'],
    });

    expect(next).toBe(SALES_GRAPH_NODES.askDiscoveryQuestion);
  });

  it('routes ready state to quote generation node', () => {
    const next = runtime.decideActionNode({
      ...baseState(),
      briefStatus: 'ready_for_quote',
    });

    expect(next).toBe(SALES_GRAPH_NODES.enqueueQuoteGeneration);
  });

  it('moves finalize_reply to persist_checkpoint', () => {
    expect(runtime.nextNode(SALES_GRAPH_NODES.finalizeReply)).toBe(
      SALES_GRAPH_NODES.persistCheckpoint,
    );
  });
});
