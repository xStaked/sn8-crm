import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SalesChannel } from './sales-graph.types';

export type SalesGraphRolloutDecision = {
  enabled: boolean;
  shadowMode: boolean;
  rolloutPercent: number;
  bucket: number;
  reason: string;
};

export type SalesGraphTransitionTelemetry = {
  conversationId: string;
  traceId: string;
  fromNode: string;
  toNode: string;
  status: 'success' | 'retry' | 'fallback' | 'error';
  latencyMs: number;
  mode: 'shadow' | 'live';
  replayed?: boolean;
  tool?: string;
  errorCode?: string;
};

@Injectable()
export class SalesGraphRolloutService {
  private readonly logger = new Logger(SalesGraphRolloutService.name);

  constructor(private readonly config: ConfigService) {}

  evaluate(input: { conversationId: string; channel: SalesChannel }): SalesGraphRolloutDecision {
    const conversationId = input.conversationId.trim();
    if (!this.getBooleanConfig('AI_SALES_LANGGRAPH_ENABLED', true)) {
      return {
        enabled: false,
        shadowMode: true,
        rolloutPercent: 0,
        bucket: this.computeStableBucket(conversationId),
        reason: 'feature_flag_disabled',
      };
    }

    const allowedChannels = this.getChannelAllowlist();
    if (!allowedChannels.has(input.channel)) {
      return {
        enabled: false,
        shadowMode: true,
        rolloutPercent: 0,
        bucket: this.computeStableBucket(conversationId),
        reason: `channel_not_enabled:${input.channel}`,
      };
    }

    const allowlistedConversations = this.getConversationAllowlist();
    const bucket = this.computeStableBucket(conversationId);
    const rolloutPercent = this.getRolloutPercentConfig();

    const selectedByAllowlist = allowlistedConversations.has(conversationId);
    const selectedByPercentage = bucket < rolloutPercent;
    if (!selectedByAllowlist && !selectedByPercentage) {
      return {
        enabled: false,
        shadowMode: true,
        rolloutPercent,
        bucket,
        reason: 'outside_rollout_percentage',
      };
    }

    return {
      enabled: true,
      shadowMode: this.getBooleanConfig('AI_SALES_LANGGRAPH_SHADOW_MODE', false),
      rolloutPercent,
      bucket,
      reason: selectedByAllowlist ? 'conversation_allowlist' : 'rollout_percentage',
    };
  }

  emitTransition(event: SalesGraphTransitionTelemetry): void {
    this.logger.log({
      event: 'sales_graph_transition',
      conversationId: event.conversationId,
      traceId: event.traceId,
      fromNode: event.fromNode,
      toNode: event.toNode,
      status: event.status,
      latencyMs: event.latencyMs,
      mode: event.mode,
      replayed: event.replayed ?? false,
      tool: event.tool,
      errorCode: event.errorCode,
    });
  }

  private getBooleanConfig(key: string, fallback: boolean): boolean {
    const raw = this.config.get<string>(key);
    if (!raw) {
      return fallback;
    }

    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }

    return fallback;
  }

  private getRolloutPercentConfig(): number {
    const raw = this.config.get<string>('AI_SALES_LANGGRAPH_ROLLOUT_PERCENT')?.trim();
    if (!raw) {
      return 0;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      return 0;
    }

    return Math.max(0, Math.min(100, parsed));
  }

  private getConversationAllowlist(): Set<string> {
    const raw = this.config
      .get<string>('AI_SALES_LANGGRAPH_CONVERSATION_ALLOWLIST')
      ?.trim();
    if (!raw) {
      return new Set<string>();
    }

    return new Set(
      raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    );
  }

  private getChannelAllowlist(): Set<SalesChannel> {
    const raw = this.config.get<string>('AI_SALES_LANGGRAPH_CHANNELS')?.trim();
    if (!raw) {
      return new Set<SalesChannel>(['whatsapp', 'webchat']);
    }

    const channels = raw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry): entry is SalesChannel => entry === 'whatsapp' || entry === 'webchat');

    if (channels.length === 0) {
      return new Set<SalesChannel>(['whatsapp', 'webchat']);
    }

    return new Set<SalesChannel>(channels);
  }

  private computeStableBucket(conversationId: string): number {
    const normalized = conversationId.trim().toLowerCase();
    let hash = 0;
    for (let index = 0; index < normalized.length; index += 1) {
      hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
    }
    return hash % 100;
  }
}
