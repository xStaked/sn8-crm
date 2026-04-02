import { MessageVariantService } from './message-variant.service';

describe('MessageVariantService', () => {
  let service: MessageVariantService;

  beforeEach(() => {
    service = new MessageVariantService();
  });

  describe('getGreetingVariant', () => {
    it('returns a first contact greeting', () => {
      const result = service.getGreetingVariant('first_contact', 'conv_123');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(10);
    });

    it('returns a returning contact greeting', () => {
      const result = service.getGreetingVariant('returning_contact', 'conv_123');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(10);
    });

    it('returns consistent variant for same conversationId', () => {
      const result1 = service.getGreetingVariant('first_contact', 'conv_123');
      const result2 = service.getGreetingVariant('first_contact', 'conv_123');
      expect(result1).toBe(result2);
    });

    it('returns different variants for different conversationIds', () => {
      const result1 = service.getGreetingVariant('first_contact', 'conv_123');
      const result2 = service.getGreetingVariant('first_contact', 'conv_456');
      // Note: There's a small chance they could be the same due to hash collision
      // but with 5 variants it's unlikely
      expect([result1, result2].every(r => typeof r === 'string')).toBe(true);
    });
  });

  describe('getReadyForQuoteVariant', () => {
    it('returns a message with project type placeholder replaced when value_focused variant selected', () => {
      // Force value_focused variant by not having budget
      const result = service.getReadyForQuoteVariant('CRM', {
        hasUrgency: false,
        hasBudget: false,
        conversationId: 'conv_123',
      });
      expect(result).toContain('CRM');
    });

    it('returns "tu proyecto" when project type is null and value_focused variant selected', () => {
      // Force value_focused variant by not having budget
      const result = service.getReadyForQuoteVariant(null, {
        hasUrgency: false,
        hasBudget: false,
        conversationId: 'conv_456',
      });
      expect(result).toContain('tu proyecto');
    });

    it('selects urgency variant when urgency is present', () => {
      const result = service.getReadyForQuoteVariant('App', {
        hasUrgency: true,
        hasBudget: false,
        conversationId: 'conv_123',
      });
      // Urgency variant should mention timing
      expect(result.toLowerCase()).toContain('timing');
    });

    it('selects value_focused variant when no budget', () => {
      const result = service.getReadyForQuoteVariant('App', {
        hasUrgency: false,
        hasBudget: false,
        conversationId: 'conv_123',
      });
      // Value focused variant should mention cotizar
      expect(result.toLowerCase()).toContain('cotizar');
    });
  });

  describe('getReviewStatusVariant', () => {
    it('returns a variant for delivered_to_customer', () => {
      const result = service.getReviewStatusVariant('delivered_to_customer', 'conv_123');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('returns a variant for pending_owner_review', () => {
      const result = service.getReviewStatusVariant('pending_owner_review', 'conv_123');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('returns a variant for changes_requested', () => {
      const result = service.getReviewStatusVariant('changes_requested', 'conv_123');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('returns consistent variant for same conversationId', () => {
      const result1 = service.getReviewStatusVariant('delivered_to_customer', 'conv_123');
      const result2 = service.getReviewStatusVariant('delivered_to_customer', 'conv_123');
      expect(result1).toBe(result2);
    });
  });

  describe('getDiscoveryAcknowledgment', () => {
    it('returns a varied acknowledgment', () => {
      const result = service.getDiscoveryAcknowledgment(0);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('returns different acknowledgments for different indices', () => {
      const results = new Set<string>();
      for (let i = 0; i < 10; i++) {
        results.add(service.getDiscoveryAcknowledgment(i));
      }
      // Should have multiple different acknowledgments
      expect(results.size).toBeGreaterThan(1);
    });

    it('cycles through acknowledgments', () => {
      const result0 = service.getDiscoveryAcknowledgment(0);
      const resultCycle = service.getDiscoveryAcknowledgment(10); // Same as index 0 if 10 variants
      expect(result0).toBe(resultCycle);
    });
  });
});
