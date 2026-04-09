import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { SalesGraphNode } from './sales-graph.contract';
import type { SalesGraphState } from './sales-graph.types';

type CheckpointStatus = 'in_progress' | 'completed' | 'failed';

export type SalesGraphCheckpoint = {
  schemaVersion: 1;
  conversationId: string;
  inboundMessageId: string;
  stateSnapshot: SalesGraphState;
  completedNodeKeys: string[];
  nodeAttempts: Record<string, number>;
  lastCompletedNode?: SalesGraphNode;
  lastError?: string;
  status: CheckpointStatus;
  updatedAt: string;
};

@Injectable()
export class SalesGraphCheckpointService {
  constructor(private readonly prisma: PrismaService) {}

  buildNodeIdempotencyKey(inboundMessageId: string, node: SalesGraphNode): string {
    return `${inboundMessageId.trim()}::${node}`;
  }

  async loadCheckpoint(conversationId: string): Promise<SalesGraphCheckpoint | null> {
    const normalizedConversationId = conversationId.trim();
    const brief = await this.prisma.commercialBrief.findUnique({
      where: { conversationId: normalizedConversationId },
      select: { conversationContext: true },
    });
    return this.extractCheckpoint(brief?.conversationContext);
  }

  async shouldResumeInbound(
    conversationId: string,
    inboundMessageId: string,
  ): Promise<boolean> {
    const checkpoint = await this.loadCheckpoint(conversationId);
    return (
      checkpoint?.inboundMessageId === inboundMessageId.trim() &&
      checkpoint.stateSnapshot.conversationId === conversationId.trim()
    );
  }

  async wasNodeProcessed(
    conversationId: string,
    inboundMessageId: string,
    node: SalesGraphNode,
  ): Promise<boolean> {
    const checkpoint = await this.loadCheckpoint(conversationId);
    if (!checkpoint || checkpoint.inboundMessageId !== inboundMessageId.trim()) {
      return false;
    }
    const key = this.buildNodeIdempotencyKey(inboundMessageId, node);
    return checkpoint.completedNodeKeys.includes(key);
  }

  async initializeInbound(state: SalesGraphState): Promise<SalesGraphCheckpoint> {
    return this.writeCheckpoint(state.conversationId, () => ({
      schemaVersion: 1,
      conversationId: state.conversationId.trim(),
      inboundMessageId: state.inboundMessageId.trim(),
      stateSnapshot: state,
      completedNodeKeys: [],
      nodeAttempts: {},
      status: 'in_progress',
      updatedAt: new Date().toISOString(),
    }));
  }

  async markNodeSuccess(
    state: SalesGraphState,
    node: SalesGraphNode,
    nextState: SalesGraphState,
  ): Promise<SalesGraphCheckpoint> {
    return this.writeCheckpoint(state.conversationId, (previous) => {
      const nodeKey = this.buildNodeIdempotencyKey(state.inboundMessageId, node);
      const completedNodeKeys = new Set(previous?.completedNodeKeys ?? []);
      completedNodeKeys.add(nodeKey);
      const status: CheckpointStatus = node === 'persist_checkpoint' ? 'completed' : 'in_progress';

      return {
        schemaVersion: 1,
        conversationId: state.conversationId.trim(),
        inboundMessageId: state.inboundMessageId.trim(),
        stateSnapshot: nextState,
        completedNodeKeys: [...completedNodeKeys],
        nodeAttempts: previous?.nodeAttempts ?? {},
        lastCompletedNode: node,
        lastError: undefined,
        status,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async markNodeFailure(
    state: SalesGraphState,
    node: SalesGraphNode,
    errorMessage: string,
    retryable: boolean,
  ): Promise<SalesGraphCheckpoint> {
    return this.writeCheckpoint(state.conversationId, (previous) => {
      const nodeKey = this.buildNodeIdempotencyKey(state.inboundMessageId, node);
      const previousAttempts = previous?.nodeAttempts?.[nodeKey] ?? 0;
      const nextAttempts = {
        ...(previous?.nodeAttempts ?? {}),
        [nodeKey]: previousAttempts + 1,
      };
      return {
        schemaVersion: 1,
        conversationId: state.conversationId.trim(),
        inboundMessageId: state.inboundMessageId.trim(),
        stateSnapshot: {
          ...state,
          lastError: errorMessage,
          retries: {
            ...state.retries,
            [node]: nextAttempts[nodeKey],
          },
        },
        completedNodeKeys: previous?.completedNodeKeys ?? [],
        nodeAttempts: nextAttempts,
        lastCompletedNode: previous?.lastCompletedNode,
        lastError: errorMessage,
        status: retryable ? 'in_progress' : 'failed',
        updatedAt: new Date().toISOString(),
      };
    });
  }

  private extractCheckpoint(context: unknown): SalesGraphCheckpoint | null {
    if (!this.isRecord(context)) {
      return null;
    }
    const checkpoint = context['langgraphCheckpoint'];
    if (!this.isRecord(checkpoint)) {
      return null;
    }
    if (typeof checkpoint['conversationId'] !== 'string') {
      return null;
    }
    return checkpoint as SalesGraphCheckpoint;
  }

  private async writeCheckpoint(
    conversationId: string,
    updater: (previous: SalesGraphCheckpoint | null) => SalesGraphCheckpoint,
  ): Promise<SalesGraphCheckpoint> {
    const normalizedConversationId = conversationId.trim();
    const existing = await this.prisma.commercialBrief.findUnique({
      where: { conversationId: normalizedConversationId },
      select: {
        id: true,
        conversationContext: true,
      },
    });

    const previousCheckpoint = this.extractCheckpoint(existing?.conversationContext);
    const nextCheckpoint = updater(previousCheckpoint);
    const baseContext = this.isRecord(existing?.conversationContext)
      ? existing!.conversationContext
      : {};
    const nextContext = {
      ...baseContext,
      langgraphCheckpoint: nextCheckpoint,
    };

    if (existing?.id) {
      await this.prisma.commercialBrief.update({
        where: { id: existing.id },
        data: { conversationContext: nextContext as any },
      });
      return nextCheckpoint;
    }

    await this.prisma.commercialBrief.create({
      data: {
        conversationId: normalizedConversationId,
        status: 'collecting',
        conversationContext: nextContext as any,
      },
    });
    return nextCheckpoint;
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
