import type { SalesGraphNode } from './sales-graph.contract';
import { SALES_GRAPH_NODES } from './sales-graph.contract';
import { SalesGraphCheckpointService } from './sales-graph.checkpoint.service';
import type { SalesGraphState } from './sales-graph.types';

describe('SalesGraphCheckpointService', () => {
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

  const makeHarness = () => {
    let brief: {
      id: string;
      conversationId: string;
      conversationContext: Record<string, any> | null;
    } | null = null;

    const prisma = {
      commercialBrief: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (!brief || brief.conversationId !== where.conversationId) {
            return null;
          }
          return {
            id: brief.id,
            conversationContext: brief.conversationContext,
          };
        }),
        create: jest.fn(async ({ data }: any) => {
          brief = {
            id: 'brief_1',
            conversationId: data.conversationId,
            conversationContext: data.conversationContext ?? null,
          };
          return brief;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          if (!brief || brief.id !== where.id) {
            throw new Error('brief not found');
          }
          brief = {
            ...brief,
            conversationContext: data.conversationContext ?? null,
          };
          return brief;
        }),
      },
    };

    return { service: new SalesGraphCheckpointService(prisma as any), prisma, getBrief: () => brief };
  };

  it('initializes checkpoint state for first inbound message', async () => {
    const { service, getBrief } = makeHarness();

    const checkpoint = await service.initializeInbound(baseState());

    expect(checkpoint.inboundMessageId).toBe('msg_1');
    expect(checkpoint.status).toBe('in_progress');
    expect(getBrief()?.conversationContext?.langgraphCheckpoint).toBeDefined();
  });

  it('marks a node as processed and reports idempotent completion for that node', async () => {
    const { service } = makeHarness();
    const state = baseState();

    await service.initializeInbound(state);
    await service.markNodeSuccess(
      state,
      SALES_GRAPH_NODES.loadContext,
      {
        ...state,
        transcript: 'hydrated',
      },
    );

    const processed = await service.wasNodeProcessed(
      state.conversationId,
      state.inboundMessageId,
      SALES_GRAPH_NODES.loadContext,
    );

    expect(processed).toBe(true);
  });

  it('resumes duplicate inbound message from previous checkpoint', async () => {
    const { service } = makeHarness();
    const state = baseState();

    await service.initializeInbound(state);
    await service.markNodeSuccess(
      state,
      SALES_GRAPH_NODES.classifyIntent,
      {
        ...state,
        intent: 'discovery',
      },
    );

    await expect(
      service.shouldResumeInbound(state.conversationId, state.inboundMessageId),
    ).resolves.toBe(true);
    await expect(
      service.shouldResumeInbound(state.conversationId, 'msg_2'),
    ).resolves.toBe(false);
  });

  it('persists failure attempts and marks non-retryable failures as failed', async () => {
    const { service } = makeHarness();
    const state = baseState();
    const failingNode: SalesGraphNode = SALES_GRAPH_NODES.enqueueQuoteGeneration;

    await service.initializeInbound(state);
    const checkpoint = await service.markNodeFailure(
      state,
      failingNode,
      'queue timeout',
      false,
    );

    const nodeKey = service.buildNodeIdempotencyKey(
      state.inboundMessageId,
      failingNode,
    );
    expect(checkpoint.status).toBe('failed');
    expect(checkpoint.nodeAttempts[nodeKey]).toBe(1);
    expect(checkpoint.lastError).toBe('queue timeout');
  });
});
