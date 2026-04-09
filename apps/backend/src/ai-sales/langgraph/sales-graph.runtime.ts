import { Injectable } from '@nestjs/common';
import { SALES_GRAPH_NODES, type SalesGraphNode } from './sales-graph.contract';
import { SalesGraphCheckpointService } from './sales-graph.checkpoint.service';
import type { SalesGraphStartInput, SalesGraphState } from './sales-graph.types';

@Injectable()
export class SalesGraphRuntime {
  constructor(
    private readonly checkpointService?: SalesGraphCheckpointService,
  ) {}

  createInitialState(input: SalesGraphStartInput): SalesGraphState {
    return {
      conversationId: input.conversationId.trim(),
      inboundMessageId: input.inboundMessageId.trim(),
      inboundBody: input.inboundBody,
      channel: input.channel,
      intent: 'unknown',
      transcript: '',
      missingFields: [],
      shouldNotifyHuman: false,
      retries: {},
      traceId: input.traceId,
      startedAt: input.startedAt,
    };
  }

  async resolveEntry(
    input: SalesGraphStartInput,
  ): Promise<{ state: SalesGraphState; replayed: boolean }> {
    const initialState = this.createInitialState(input);
    if (!this.checkpointService) {
      return { state: initialState, replayed: false };
    }

    const shouldResume = await this.checkpointService.shouldResumeInbound(
      initialState.conversationId,
      initialState.inboundMessageId,
    );
    if (shouldResume) {
      const checkpoint = await this.checkpointService.loadCheckpoint(
        initialState.conversationId,
      );
      if (checkpoint) {
        return { state: checkpoint.stateSnapshot, replayed: true };
      }
    }

    await this.checkpointService.initializeInbound(initialState);
    return { state: initialState, replayed: false };
  }

  async shouldSkipNode(
    state: SalesGraphState,
    node: SalesGraphNode,
  ): Promise<boolean> {
    if (!this.checkpointService) {
      return false;
    }
    return this.checkpointService.wasNodeProcessed(
      state.conversationId,
      state.inboundMessageId,
      node,
    );
  }

  async persistNodeSuccess(
    state: SalesGraphState,
    node: SalesGraphNode,
    nextState: SalesGraphState,
  ): Promise<void> {
    if (!this.checkpointService) {
      return;
    }
    await this.checkpointService.markNodeSuccess(state, node, nextState);
  }

  async persistNodeFailure(
    state: SalesGraphState,
    node: SalesGraphNode,
    errorMessage: string,
    retryable: boolean,
  ): Promise<void> {
    if (!this.checkpointService) {
      return;
    }
    await this.checkpointService.markNodeFailure(
      state,
      node,
      errorMessage,
      retryable,
    );
  }

  /**
   * Deterministic routing contract for the initial LangGraph scaffold.
   * This decides the first action node after intent classification.
   */
  decideActionNode(state: SalesGraphState): SalesGraphNode {
    if (state.intent === 'new_project') {
      return SALES_GRAPH_NODES.handleNewProject;
    }

    if (state.intent === 'human_handoff' || state.shouldNotifyHuman) {
      return SALES_GRAPH_NODES.humanHandoff;
    }

    if (state.quoteReviewStatus === 'delivered_to_customer') {
      return SALES_GRAPH_NODES.handleDeliveredQuote;
    }

    if (
      state.quoteReviewStatus === 'pending_owner_review' ||
      state.quoteReviewStatus === 'changes_requested' ||
      state.quoteReviewStatus === 'approved'
    ) {
      return SALES_GRAPH_NODES.replyReviewStatus;
    }

    if (state.missingFields.length > 0 || state.briefStatus === 'collecting') {
      return SALES_GRAPH_NODES.askDiscoveryQuestion;
    }

    return SALES_GRAPH_NODES.enqueueQuoteGeneration;
  }

  nextNode(currentNode: SalesGraphNode): SalesGraphNode {
    switch (currentNode) {
      case SALES_GRAPH_NODES.loadContext:
        return SALES_GRAPH_NODES.classifyIntent;
      case SALES_GRAPH_NODES.classifyIntent:
        return SALES_GRAPH_NODES.runDiscoveryExtraction;
      case SALES_GRAPH_NODES.handleNewProject:
        return SALES_GRAPH_NODES.runDiscoveryExtraction;
      case SALES_GRAPH_NODES.runDiscoveryExtraction:
        return SALES_GRAPH_NODES.evaluateBriefReadiness;
      case SALES_GRAPH_NODES.evaluateBriefReadiness:
        return SALES_GRAPH_NODES.finalizeReply;
      case SALES_GRAPH_NODES.askDiscoveryQuestion:
      case SALES_GRAPH_NODES.replyReviewStatus:
      case SALES_GRAPH_NODES.handleDeliveredQuote:
      case SALES_GRAPH_NODES.humanHandoff:
        return SALES_GRAPH_NODES.finalizeReply;
      case SALES_GRAPH_NODES.enqueueQuoteGeneration:
        return SALES_GRAPH_NODES.requestOwnerReview;
      case SALES_GRAPH_NODES.requestOwnerReview:
        return SALES_GRAPH_NODES.replyReviewStatus;
      case SALES_GRAPH_NODES.finalizeReply:
        return SALES_GRAPH_NODES.persistCheckpoint;
      case SALES_GRAPH_NODES.persistCheckpoint:
      default:
        return SALES_GRAPH_NODES.persistCheckpoint;
    }
  }
}
