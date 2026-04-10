import { Inject, Injectable, Logger } from '@nestjs/common';
import { AI_PROVIDER, AiProvider } from '../ai-sales/ai-provider.interface';

export type SalesIntent =
  | 'new_project'
  | 'clarification'
  | 'quote_status'
  | 'discovery'
  | 'post_delivery'
  | 'human_handoff'
  | 'quote_acceptance'
  | 'quote_questions'
  | 'quote_pdf_request'
  | 'greeting'
  | 'off_topic'
  | 'unknown';

export type IntentClassificationResult = {
  intent: SalesIntent;
  confidence: number;
  reasoning: string;
  requiresHuman: boolean;
};

const INTENT_CLASSIFICATION_SYSTEM_PROMPT = `Eres un clasificador de intenciones para un asistente comercial de WhatsApp de SN8 Labs (agencia de desarrollo de software).

Tu tarea es analizar el mensaje del cliente y determinar su intención principal.

## Intenciones posibles:

1. **new_project**: El cliente quiere cotizar un nuevo proyecto o menciona empezar de cero
2. **clarification**: El cliente está confundido sobre qué proyecto estamos hablando o pide aclaración
3. **quote_status**: El cliente pregunta por el estado de su cotización o propuesta
4. **discovery**: El cliente está respondiendo preguntas de descubrimiento o dando información sobre su proyecto
5. **post_delivery**: El cliente responde después de recibir su cotización (pero no es aceptación clara ni preguntas)
6. **human_handoff**: El cliente quiere hablar con un humano, está frustrado o enojado
7. **quote_acceptance**: El cliente quiere avanzar con la propuesta enviada
8. **quote_questions**: El cliente tiene dudas o preguntas específicas sobre la cotización enviada
9. **quote_pdf_request**: El cliente pide el PDF de la cotización o propuesta
10. **greeting**: Saludo inicial sin contexto previo
11. **off_topic**: Mensaje fuera de tema o no relacionado con proyectos o cotizaciones
12. **unknown**: No se puede determinar la intención con claridad

## Reglas importantes:

- Si el mensaje muestra frustración, enojo o usa lenguaje fuerte → **human_handoff** con requiresHuman=true
- Si el cliente menciona "otro proyecto", "cotizar otra cosa", "empezar de cero" → **new_project**
- Si pregunta por el estado de algo que está en revisión → **quote_status**
- Si responde a preguntas de descubrimiento → **discovery**
- Si dice "avancemos", "dale", "perfecto" después de recibir cotización → **quote_acceptance**
- Si tiene dudas sobre precio, tiempo, alcance de una cotización ya enviada → **quote_questions**
- Si pide el PDF o documento → **quote_pdf_request**
- Si está confundido sobre qué proyecto estamos hablando → **clarification**

## Contexto adicional:

Te proporcionaré contexto sobre el estado actual de la conversación para ayudar con la clasificación.

Responde ÚNICAMENTE con un JSON válido en este formato:
{
  "intent": "<intención>",
  "confidence": <0.0 a 1.0>,
  "reasoning": "<razonamiento breve en español>",
  "requiresHuman": <true o false>
}`;

@Injectable()
export class AiIntentClassifierService {
  private readonly logger = new Logger(AiIntentClassifierService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  async classifyIntent(input: {
    message: string | null;
    context?: {
      hasBrief?: boolean;
      briefStatus?: string;
      hasDraft?: boolean;
      draftReviewStatus?: string;
      conversationHistory?: string;
    };
  }): Promise<IntentClassificationResult> {
    const { message, context } = input;

    if (!message || message.trim().length === 0) {
      return {
        intent: 'unknown',
        confidence: 0,
        reasoning: 'Mensaje vacío o nulo',
        requiresHuman: false,
      };
    }

    try {
      const contextDescription = context
        ? `
Estado actual:
- Tiene brief: ${context.hasBrief ? 'Sí' : 'No'}
- Estado del brief: ${context.briefStatus || 'N/A'}
- Tiene borrador de cotización: ${context.hasDraft ? 'Sí' : 'No'}
- Estado de revisión: ${context.draftReviewStatus || 'N/A'}
${context.conversationHistory ? `\nÚltimos mensajes:\n${context.conversationHistory}` : ''}
`
        : 'Sin contexto disponible';

      const userMessage = `
${contextDescription}

Mensaje del cliente: "${message.trim()}"

Clasifica la intención del mensaje anterior.
`;

      const result = await this.provider.chat.completion({
        systemPrompt: INTENT_CLASSIFICATION_SYSTEM_PROMPT,
        userMessage,
        model: process.env.AI_INTENT_MODEL || 'deepseek-chat',
        temperature: 0.1,
        maxTokens: 200,
      });

      const parsed = this.parseIntentResponse(result);
      return parsed;
    } catch (error) {
      this.logger.warn({
        event: 'ai_intent_classification_fallback',
        error: error instanceof Error ? error.message : String(error),
        message: message?.substring(0, 100),
      });

      // Fallback to rule-based classification
      return this.fallbackRuleBasedClassification(message);
    }
  }

  private parseIntentResponse(response: string): IntentClassificationResult {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as IntentClassificationResult;

      // Validate the parsed result
      if (!parsed.intent || typeof parsed.confidence !== 'number') {
        throw new Error('Invalid intent classification response structure');
      }

      return {
        intent: this.normalizeIntent(parsed.intent),
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
        reasoning: parsed.reasoning || 'Clasificación automática',
        requiresHuman: parsed.requiresHuman || false,
      };
    } catch (error) {
      this.logger.warn({
        event: 'ai_intent_parse_fallback',
        error: error instanceof Error ? error.message : String(error),
        response: response.substring(0, 200),
      });

      // If parsing fails, try rule-based fallback
      return this.fallbackRuleBasedClassification(response);
    }
  }

  private normalizeIntent(intent: string): SalesIntent {
    const normalized = intent.toLowerCase().trim();

    const intentMap: Record<string, SalesIntent> = {
      new_project: 'new_project',
      clarification: 'clarification',
      quote_status: 'quote_status',
      discovery: 'discovery',
      post_delivery: 'post_delivery',
      human_handoff: 'human_handoff',
      quote_acceptance: 'quote_acceptance',
      quote_questions: 'quote_questions',
      quote_pdf_request: 'quote_pdf_request',
      greeting: 'greeting',
      off_topic: 'off_topic',
      unknown: 'unknown',
    };

    // Handle variations
    if (normalized.includes('accept') || normalized.includes('acept')) {
      return 'quote_acceptance';
    }
    if (normalized.includes('question') || normalized.includes('pregunta') || normalized.includes('duda')) {
      return 'quote_questions';
    }
    if (normalized.includes('pdf') || normalized.includes('documento')) {
      return 'quote_pdf_request';
    }

    return intentMap[normalized] || 'unknown';
  }

  private fallbackRuleBasedClassification(message: string): IntentClassificationResult {
    const lowerMessage = message.toLowerCase().trim();

    // Human handoff / frustration (highest priority)
    const frustrationPatterns = [
      /hpta/i, /hp/i, /mierda/i, /carajo/i, /puta/i, /estupido/i, /est[uú]pido/i,
      /pendejo/i, /imb[eé]cil/i, /idiota/i, /no funciona/i, /no sirve/i,
      /pesimo/i, /p[eé]simo/i, /humano/i, /asesor/i, /persona/i,
    ];
    if (frustrationPatterns.some((p) => p.test(lowerMessage))) {
      return {
        intent: 'human_handoff',
        confidence: 0.9,
        reasoning: 'Detectado patrón de frustración o solicitud de humano',
        requiresHuman: true,
      };
    }

    // New project
    const newProjectPatterns = [
      /otro proyecto/i, /otra cosa/i, /nuevo proyecto/i, /empezar de nuevo/i,
      /cotizar otro/i, /diferente proyecto/i,
    ];
    if (newProjectPatterns.some((p) => p.test(lowerMessage))) {
      return {
        intent: 'new_project',
        confidence: 0.85,
        reasoning: 'Menciona otro proyecto o empezar de nuevo',
        requiresHuman: false,
      };
    }

    // PDF request
    if (/pdf|documento/i.test(lowerMessage)) {
      return {
        intent: 'quote_pdf_request',
        confidence: 0.8,
        reasoning: 'Solicita PDF o documento',
        requiresHuman: false,
      };
    }

    // Quote acceptance
    const acceptancePatterns = [
      /avancemos/i, /adelante/i, /perfecto/i, /listo/i, /procedamos/i,
      /^dale$/i, /^va$/i, /^bueno$/i, /^bien$/i,
    ];
    if (acceptancePatterns.some((p) => p.test(lowerMessage))) {
      return {
        intent: 'quote_acceptance',
        confidence: 0.75,
        reasoning: 'Muestra aceptación o acuerdo',
        requiresHuman: false,
      };
    }

    // Greeting
    const greetingPatterns = [
      /^hola$/i, /^buenos/i, /^buenas/i, /^hey/i, /^saludos/i,
    ];
    if (greetingPatterns.some((p) => p.test(lowerMessage))) {
      return {
        intent: 'greeting',
        confidence: 0.9,
        reasoning: 'Saludo inicial',
        requiresHuman: false,
      };
    }

    // Default: discovery
    return {
      intent: 'discovery',
      confidence: 0.5,
      reasoning: 'Intención por defecto: discovery',
      requiresHuman: false,
    };
  }
}
