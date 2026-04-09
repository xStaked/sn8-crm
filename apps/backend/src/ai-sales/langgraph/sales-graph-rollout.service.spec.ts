import { ConfigService } from '@nestjs/config';
import { SalesGraphRolloutService } from './sales-graph-rollout.service';

describe('SalesGraphRolloutService', () => {
  let config: { get: jest.Mock };
  let service: SalesGraphRolloutService;

  beforeEach(() => {
    config = {
      get: jest.fn(),
    };
    service = new SalesGraphRolloutService(config as unknown as ConfigService);
  });

  it('disables rollout when feature flag is false', () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'AI_SALES_LANGGRAPH_ENABLED') {
        return 'false';
      }
      return undefined;
    });

    const decision = service.evaluate({
      conversationId: '573001112233',
      channel: 'whatsapp',
    });

    expect(decision.enabled).toBe(false);
    expect(decision.reason).toBe('feature_flag_disabled');
  });

  it('enables rollout in shadow mode when bucket falls within percentage', () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'AI_SALES_LANGGRAPH_ENABLED') {
        return 'true';
      }
      if (key === 'AI_SALES_LANGGRAPH_SHADOW_MODE') {
        return 'true';
      }
      if (key === 'AI_SALES_LANGGRAPH_ROLLOUT_PERCENT') {
        return '100';
      }
      return undefined;
    });

    const decision = service.evaluate({
      conversationId: '573001112233',
      channel: 'whatsapp',
    });

    expect(decision.enabled).toBe(true);
    expect(decision.shadowMode).toBe(true);
    expect(decision.reason).toBe('rollout_percentage');
  });

  it('respects channel allowlist', () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'AI_SALES_LANGGRAPH_ENABLED') {
        return 'true';
      }
      if (key === 'AI_SALES_LANGGRAPH_CHANNELS') {
        return 'webchat';
      }
      if (key === 'AI_SALES_LANGGRAPH_ROLLOUT_PERCENT') {
        return '100';
      }
      return undefined;
    });

    const decision = service.evaluate({
      conversationId: '573001112233',
      channel: 'whatsapp',
    });

    expect(decision.enabled).toBe(false);
    expect(decision.reason).toBe('channel_not_enabled:whatsapp');
  });

  it('forces rollout for allowlisted conversation IDs', () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'AI_SALES_LANGGRAPH_ENABLED') {
        return 'true';
      }
      if (key === 'AI_SALES_LANGGRAPH_ROLLOUT_PERCENT') {
        return '0';
      }
      if (key === 'AI_SALES_LANGGRAPH_CONVERSATION_ALLOWLIST') {
        return '573001112233,573001554433';
      }
      return undefined;
    });

    const decision = service.evaluate({
      conversationId: '573001112233',
      channel: 'whatsapp',
    });

    expect(decision.enabled).toBe(true);
    expect(decision.reason).toBe('conversation_allowlist');
  });
});
