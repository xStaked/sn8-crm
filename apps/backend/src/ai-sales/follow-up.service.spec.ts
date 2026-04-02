import { FollowUpService } from './follow-up.service';
import { MessageVariantService } from './message-variant.service';

describe('FollowUpService', () => {
  let service: FollowUpService;
  let messageVariantService: MessageVariantService;

  beforeEach(() => {
    messageVariantService = new MessageVariantService();
    service = new FollowUpService(messageVariantService);
  });

  describe('generateFollowUp', () => {
    it('generates gentle nudge for first delivered follow-up', () => {
      const result = service.generateFollowUp({
        conversationId: 'conv_123',
        reviewStatus: 'delivered_to_customer',
        previousFollowUps: 0,
      });

      expect(result.followUpType).toBe('gentle_nudge');
      expect(result.shouldEscalate).toBe(false);
      expect(result.message).toContain('propuesta');
    });

    it('generates value-add for second delivered follow-up after 3+ days', () => {
      const result = service.generateFollowUp({
        conversationId: 'conv_123',
        reviewStatus: 'delivered_to_customer',
        previousFollowUps: 1,
        daysSinceLastContact: 4,
      });

      expect(result.followUpType).toBe('value_add');
      expect(result.shouldEscalate).toBe(false);
    });

    it('generates closing attempt for third+ delivered follow-up after 7+ days', () => {
      const result = service.generateFollowUp({
        conversationId: 'conv_123',
        reviewStatus: 'delivered_to_customer',
        previousFollowUps: 2,
        daysSinceLastContact: 8,
      });

      expect(result.followUpType).toBe('closing_attempt');
      expect(result.shouldEscalate).toBe(false);
    });

    it('escalates after 3+ follow-ups', () => {
      const result = service.generateFollowUp({
        conversationId: 'conv_123',
        reviewStatus: 'delivered_to_customer',
        previousFollowUps: 3,
        daysSinceLastContact: 8,
      });

      expect(result.followUpType).toBe('closing_attempt');
      expect(result.shouldEscalate).toBe(true);
    });

    it('generates status update for pending owner review', () => {
      const result = service.generateFollowUp({
        conversationId: 'conv_123',
        reviewStatus: 'pending_owner_review',
        daysSinceLastContact: 3,
      });

      expect(result.followUpType).toBe('status_update');
      expect(result.message.length).toBeGreaterThan(10);
    });

    it('escalates pending review after 5+ days', () => {
      const result = service.generateFollowUp({
        conversationId: 'conv_123',
        reviewStatus: 'pending_owner_review',
        daysSinceLastContact: 6,
      });

      expect(result.shouldEscalate).toBe(true);
    });

    it('generates status update for changes requested', () => {
      const result = service.generateFollowUp({
        conversationId: 'conv_123',
        reviewStatus: 'changes_requested',
        daysSinceLastContact: 2,
      });

      expect(result.followUpType).toBe('status_update');
      expect(result.message.length).toBeGreaterThan(10);
      // Message should relate to changes/ajustes
      expect(result.message.toLowerCase()).toMatch(/ajust|modific|detalle/);
    });

    it('returns consistent message for same conversationId', () => {
      const result1 = service.generateFollowUp({
        conversationId: 'conv_123',
        reviewStatus: 'delivered_to_customer',
        previousFollowUps: 0,
      });
      const result2 = service.generateFollowUp({
        conversationId: 'conv_123',
        reviewStatus: 'delivered_to_customer',
        previousFollowUps: 0,
      });

      expect(result1.message).toBe(result2.message);
    });
  });

  describe('shouldSendFollowUp', () => {
    it('returns true for delivered quote after 2 days', () => {
      const lastContact = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(
        service.shouldSendFollowUp(lastContact, 'delivered_to_customer', 0),
      ).toBe(true);
    });

    it('returns false for delivered quote before 2 days', () => {
      const lastContact = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      expect(
        service.shouldSendFollowUp(lastContact, 'delivered_to_customer', 0),
      ).toBe(false);
    });

    it('returns true for second follow-up after 5 days', () => {
      const lastContact = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      expect(
        service.shouldSendFollowUp(lastContact, 'delivered_to_customer', 1),
      ).toBe(true);
    });

    it('returns true for pending review after 2 days', () => {
      const lastContact = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(
        service.shouldSendFollowUp(lastContact, 'pending_owner_review', 0),
      ).toBe(true);
    });

    it('returns false for pending review if already followed up', () => {
      const lastContact = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(
        service.shouldSendFollowUp(lastContact, 'pending_owner_review', 1),
      ).toBe(false);
    });

    it('returns true for changes requested after 1 day', () => {
      const lastContact = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      expect(
        service.shouldSendFollowUp(lastContact, 'changes_requested', 0),
      ).toBe(true);
    });

    it('returns false for approved status', () => {
      const lastContact = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      expect(
        service.shouldSendFollowUp(lastContact, 'approved', 0),
      ).toBe(false);
    });
  });
});
