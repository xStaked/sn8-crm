import {
  buildOffFlowMessage,
  detectOffFlowType,
  getContextualResponse,
  OFF_FLOW_MAX_RETRIES,
} from './off-flow.prompt';
import { BotConversationState } from '../bot-conversation.types';

describe('Off Flow Prompt', () => {
  describe('detectOffFlowType', () => {
    it('detects early price questions', () => {
      expect(detectOffFlowType('¿Cuánto cuesta una app?')).toBe('early_price_question');
      expect(detectOffFlowType('Precio de un CRM')).toBe('early_price_question');
      expect(detectOffFlowType('Qué presupuesto necesito')).toBe('early_price_question');
    });

    it('detects topic switches', () => {
      expect(detectOffFlowType('Tengo otro proyecto')).toBe('topic_switch');
      expect(detectOffFlowType('Y otra idea diferente')).toBe('topic_switch');
    });

    it('detects technical questions', () => {
      expect(detectOffFlowType('¿Qué tecnología usan?')).toBe('technical_question');
      expect(detectOffFlowType('¿Cuál stack recomiendan?')).toBe('technical_question');
    });

    it('detects example requests', () => {
      expect(detectOffFlowType('Tienen ejemplos de trabajos similares?')).toBe('example_request');
      expect(detectOffFlowType('Pueden mostrarme casos de clientes?')).toBe('example_request');
      expect(detectOffFlowType('Tienen portafolio de trabajos hechos?')).toBe('example_request');
    });

    it('returns generic for unclear messages', () => {
      expect(detectOffFlowType('Hola')).toBe('generic');
      expect(detectOffFlowType('ok')).toBe('generic');
      expect(detectOffFlowType(null)).toBe('generic');
    });

    it('does not detect price when budget is already defined', () => {
      expect(detectOffFlowType('Ya tengo un presupuesto de 10k')).toBe('generic');
    });
  });

  describe('getContextualResponse', () => {
    it('returns early price response', () => {
      const response = getContextualResponse('early_price_question', BotConversationState.QUALIFYING, 'conv_123');
      // Price response should acknowledge budget concern
      expect(response.length).toBeGreaterThan(20);
      expect(response.toLowerCase()).toMatch(/precio|presupuesto|costo/);
    });

    it('returns topic switch response', () => {
      const response = getContextualResponse('topic_switch', BotConversationState.QUALIFYING, 'conv_123');
      expect(response.toLowerCase()).toContain('proyecto');
    });

    it('returns technical question response', () => {
      const response = getContextualResponse('technical_question', BotConversationState.QUALIFYING, 'conv_123');
      // Technical response should acknowledge technical aspect
      expect(response.length).toBeGreaterThan(20);
    });

    it('returns example request response', () => {
      const response = getContextualResponse('example_request', BotConversationState.QUALIFYING, 'conv_123');
      // Example response should mention experience or cases
      expect(response.length).toBeGreaterThan(20);
    });

    it('returns consistent response for same conversationId', () => {
      const r1 = getContextualResponse('early_price_question', BotConversationState.QUALIFYING, 'conv_123');
      const r2 = getContextualResponse('early_price_question', BotConversationState.QUALIFYING, 'conv_123');
      expect(r1).toBe(r2);
    });
  });

  describe('buildOffFlowMessage', () => {
    it('includes acknowledgment and guidance', () => {
      const result = buildOffFlowMessage({
        state: BotConversationState.GREETING,
        attempt: 0,
        lastUserMessage: 'Test message',
        conversationId: 'conv_123',
      });
      expect(result).toContain('Tomo nota');
      expect(result.length).toBeGreaterThan(20);
    });

    it('includes media acknowledgment when isMedia is true', () => {
      const result = buildOffFlowMessage({
        state: BotConversationState.GREETING,
        attempt: 0,
        isMedia: true,
        conversationId: 'conv_123',
      });
      expect(result).toContain('solo procesamos mensajes de texto');
    });

    it('includes handoff offer on last retry', () => {
      const result = buildOffFlowMessage({
        state: BotConversationState.GREETING,
        attempt: OFF_FLOW_MAX_RETRIES - 1,
        lastUserMessage: 'Test',
        conversationId: 'conv_123',
      });
      expect(result).toContain('escalar');
    });

    it('handles empty message', () => {
      const result = buildOffFlowMessage({
        state: BotConversationState.GREETING,
        attempt: 0,
        lastUserMessage: '',
        conversationId: 'conv_123',
      });
      expect(result).toContain('contexto');
    });

    it('provides contextual response for price questions', () => {
      const result = buildOffFlowMessage({
        state: BotConversationState.QUALIFYING,
        attempt: 0,
        lastUserMessage: '¿Cuánto cuesta?',
        conversationId: 'conv_123',
      });
      // Should acknowledge the price question
      expect(result.length).toBeGreaterThan(30);
      expect(result.toLowerCase()).toMatch(/precio|presupuesto|costo/);
    });
  });
});
