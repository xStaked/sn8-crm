import { Prisma } from '@prisma/client';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import {
  BOT_CONVERSATION_KEY_PREFIX,
  type BotConversationSnapshot,
  type SaveBotConversationStateInput,
} from './bot-conversation.types';

@Injectable()
export class BotConversationRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async loadState(conversationId: string): Promise<BotConversationSnapshot | null> {
    const payload = await this.redis.get(this.buildKey(conversationId));
    if (!payload) {
      return null;
    }

    return this.deserialize(payload);
  }

  async saveState(
    input: SaveBotConversationStateInput,
    ttlSeconds: number,
  ): Promise<BotConversationSnapshot> {
    const snapshot = this.toSnapshot(input, ttlSeconds);

    await this.redis.set(
      this.buildKey(snapshot.conversationId),
      this.serialize(snapshot),
      'EX',
      ttlSeconds,
    );

    await this.prisma.conversationState.upsert({
      where: { conversationId: snapshot.conversationId },
      create: {
        conversationId: snapshot.conversationId,
        state: snapshot.state,
        metadata: (snapshot.metadata as Prisma.InputJsonValue | null) ?? undefined,
        offFlowCount: snapshot.offFlowCount,
        lastInboundMessageId: snapshot.lastInboundMessageId,
        lastTransitionAt: snapshot.lastTransitionAt,
        expiresAt: snapshot.expiresAt,
      },
      update: {
        state: snapshot.state,
        metadata: (snapshot.metadata as Prisma.InputJsonValue | null) ?? undefined,
        offFlowCount: snapshot.offFlowCount,
        lastInboundMessageId: snapshot.lastInboundMessageId,
        lastTransitionAt: snapshot.lastTransitionAt,
        expiresAt: snapshot.expiresAt,
      },
    });

    return snapshot;
  }

  async rebuildState(conversationId: string): Promise<BotConversationSnapshot | null> {
    const record = await this.prisma.conversationState.findUnique({
      where: { conversationId },
    });

    if (!record) {
      return null;
    }

    const snapshot = this.fromRecord(record);
    const ttlSeconds = Math.max(
      1,
      Math.ceil((snapshot.expiresAt.getTime() - Date.now()) / 1000),
    );

    if (snapshot.expiresAt.getTime() <= Date.now()) {
      await this.redis.del(this.buildKey(conversationId));
      return null;
    }

    await this.redis.set(
      this.buildKey(snapshot.conversationId),
      this.serialize(snapshot),
      'EX',
      ttlSeconds,
    );

    return snapshot;
  }

  private buildKey(conversationId: string): string {
    return `${BOT_CONVERSATION_KEY_PREFIX}${conversationId}`;
  }

  private toSnapshot(
    input: SaveBotConversationStateInput,
    ttlSeconds: number,
  ): BotConversationSnapshot {
    const lastTransitionAt = input.lastTransitionAt ?? new Date();

    return {
      conversationId: input.conversationId,
      state: input.state,
      metadata: input.metadata ?? null,
      offFlowCount: input.offFlowCount ?? 0,
      lastInboundMessageId: input.lastInboundMessageId ?? null,
      lastTransitionAt,
      expiresAt: new Date(lastTransitionAt.getTime() + ttlSeconds * 1000),
    };
  }

  private fromRecord(record: {
    conversationId: string;
    state: string;
    metadata: unknown;
    offFlowCount: number;
    lastInboundMessageId: string | null;
    lastTransitionAt: Date;
    expiresAt: Date;
  }): BotConversationSnapshot {
    return {
      conversationId: record.conversationId,
      state: record.state as BotConversationSnapshot['state'],
      metadata: (record.metadata as BotConversationSnapshot['metadata']) ?? null,
      offFlowCount: record.offFlowCount,
      lastInboundMessageId: record.lastInboundMessageId,
      lastTransitionAt: new Date(record.lastTransitionAt),
      expiresAt: new Date(record.expiresAt),
    };
  }

  private serialize(snapshot: BotConversationSnapshot): string {
    return JSON.stringify({
      ...snapshot,
      lastTransitionAt: snapshot.lastTransitionAt.toISOString(),
      expiresAt: snapshot.expiresAt.toISOString(),
    });
  }

  private deserialize(payload: string): BotConversationSnapshot {
    const parsed = JSON.parse(payload) as Omit<
      BotConversationSnapshot,
      'lastTransitionAt' | 'expiresAt'
    > & {
      lastTransitionAt: string;
      expiresAt: string;
    };

    return {
      ...parsed,
      metadata: parsed.metadata ?? null,
      lastInboundMessageId: parsed.lastInboundMessageId ?? null,
      lastTransitionAt: new Date(parsed.lastTransitionAt),
      expiresAt: new Date(parsed.expiresAt),
    };
  }
}
