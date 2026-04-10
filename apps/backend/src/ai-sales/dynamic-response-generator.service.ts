import { Inject, Injectable, Logger } from '@nestjs/common';
import { AI_PROVIDER, AiProvider } from '../ai-sales/ai-provider.interface';

export type DynamicResponseInput = {
  userMessage: string;
  intent: string;
  context: {
    hasBrief: boolean;
    briefStatus?: string;
    briefSummary?: string;
    hasDraft: boolean;
    draftReviewStatus?: string;
    missingFields?: string[];
    conversationHistory?: string;
    customerName?: string;
    projectType?: string;
  };
};

export type DynamicResponseResult = {
  responseBody: string;
  responseSource: string;
  requiresHuman?: boolean;
  nextAction?: string;
};

const RESPONSE_GENERATION_SYSTEM_PROMPT = `Eres el asistente comercial de SN8 Labs, una agencia de desarrollo de software especializada en:
- Landing pages y sitios web
- CRMs y sistemas de ventas
- Automatizaciones con IA
- Aplicaciones móviles y web
- Integraciones con WhatsApp y otras plataformas

## Tu personalidad:
- Profesional pero cercano, tratas de "tú" no de "usted"
- Proactivo y servicial
- Claro y conciso en tus respuestas
- Nunca inventes información que no tengas
- Si no sabes algo, dilo honestamente

## Reglas importantes:

1. **NUNCA repitas el mismo mensaje**: Si el usuario ya recibió una respuesta similar, varía tu enfoque
2. **Sé conversacional**: Usa lenguaje natural, evita sonar robótico
3. **Mantén contexto**: Recuerda lo que ya se ha discutido
4. **Sé proactivo**: Si puedes anticipar la siguiente necesidad del usuario, hazlo
5. **Sé honesto**: Si algo está pendiente de revisión interna, dilo claramente
6. **No inventes**: No inventes precios, plazos o alcance que no esté en el brief

## Formato de respuestas:

Para cada situación, genera una respuesta natural y contextual que:
- Reconozca el mensaje del usuario
- Proporcione información útil y relevante
- Indique claramente el siguiente paso
- Mantenga la conversación fluida

Responde ÚNICAMENTE con un JSON válido en este formato:
{
  "responseBody": "<tu respuesta en español, puede incluir saltos de línea>",
  "responseSource": "<fuente: commercial-discovery, commercial-ready-for-quote, commercial-review-status, commercial-delivered-acceptance, commercial-delivered-questions, commercial-delivered-pdf-request, commercial-clarification, commercial-human-handoff, default-auto-reply>",
  "requiresHuman": <true o false>,
  "nextAction": "<opcional: siguiente acción sugerida>"
}`;

@Injectable()
export class DynamicResponseGeneratorService {
  private readonly logger = new Logger(DynamicResponseGeneratorService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  async generateResponse(input: DynamicResponseInput): Promise<DynamicResponseResult> {
    try {
      const contextDescription = this.buildContextDescription(input.context);

      const userMessage = `
${contextDescription}

Mensaje del usuario: "${input.userMessage}"
Intención detectada: ${input.intent}

Genera una respuesta apropiada y natural para esta situación.
`;

      const result = await this.provider.chat.completion({
        systemPrompt: RESPONSE_GENERATION_SYSTEM_PROMPT,
        userMessage,
        model: process.env.AI_RESPONSE_MODEL || 'deepseek-chat',
        temperature: 0.7,
        maxTokens: 500,
      });

      const parsed = this.parseResponse(result);
      return parsed;
    } catch (error) {
      this.logger.warn({
        event: 'dynamic_response_generation_fallback',
        error: error instanceof Error ? error.message : String(error),
        intent: input.intent,
      });

      // Fallback to static response
      return this.fallbackStaticResponse(input);
    }
  }

  private buildContextDescription(context: DynamicResponseInput['context']): string {
    let desc = '';

    if (context.customerName) {
      desc += `Cliente: ${context.customerName}\n`;
    }

    if (context.hasBrief) {
      desc += `Estado del brief: ${context.briefStatus || 'N/A'}\n`;
      if (context.briefSummary) {
        desc += `Resumen: ${context.briefSummary}\n`;
      }
      if (context.projectType) {
        desc += `Tipo de proyecto: ${context.projectType}\n`;
      }
      if (context.missingFields && context.missingFields.length > 0) {
        desc += `Campos faltantes: ${context.missingFields.join(', ')}\n`;
      }
    } else {
      desc += 'Sin brief aún - primera interacción o proyecto nuevo\n';
    }

    if (context.hasDraft) {
      desc += `Estado de cotización: ${context.draftReviewStatus || 'N/A'}\n`;
    }

    if (context.conversationHistory) {
      const recentMessages = context.conversationHistory.split('\n').slice(-4).join('\n');
      desc += `\nÚltimos mensajes:\n${recentMessages}\n`;
    }

    return desc;
  }

  private parseResponse(response: string): DynamicResponseResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as DynamicResponseResult;

      if (!parsed.responseBody || !parsed.responseSource) {
        throw new Error('Invalid response structure');
      }

      return {
        responseBody: parsed.responseBody,
        responseSource: parsed.responseSource,
        requiresHuman: parsed.requiresHuman || false,
        nextAction: parsed.nextAction,
      };
    } catch (error) {
      this.logger.warn({
        event: 'dynamic_response_parse_fallback',
        error: error instanceof Error ? error.message : String(error),
        response: response.substring(0, 200),
      });

      throw error; // Will be caught by outer try-catch
    }
  }

  private fallbackStaticResponse(input: DynamicResponseInput): DynamicResponseResult {
    const { intent, userMessage } = input;
    const lowerMessage = userMessage.toLowerCase().trim();

    // Static fallbacks based on intent
    switch (intent) {
      case 'quote_acceptance':
        return {
          responseBody:
            '¡Perfecto! Quedo atento para coordinar el siguiente paso. Un asesor te contactará pronto para formalizar todo. ¿Algo más en lo que pueda ayudarte mientras tanto?',
          responseSource: 'commercial-delivered-acceptance',
        };

      case 'quote_pdf_request':
        return {
          responseBody:
            'Te comparto el enlace para descargar la propuesta en PDF. ¿Te quedó claro todo o tienes alguna duda específica?',
          responseSource: 'commercial-delivered-pdf-request',
        };

      case 'quote_questions':
      case 'clarification':
        return {
          responseBody:
            'Entiendo que tienes dudas sobre la propuesta. Para darte la mejor atención, voy a pasarte con un asesor humano que puede resolver tus preguntas específicas. Un momento por favor.',
          responseSource: 'commercial-delivered-questions',
          requiresHuman: true,
        };

      case 'new_project':
        return {
          responseBody:
            '¡Genial! Vamos a empezar con un nuevo proyecto. Cuéntame, ¿qué tipo de solución necesitas? Puede ser una landing page, un CRM, una automatización, una app, etc.',
          responseSource: 'commercial-discovery',
        };

      case 'discovery':
        return {
          responseBody:
            'Gracias por la información. ¿Hay algo más que deba considerar antes de preparar la propuesta?',
          responseSource: 'commercial-discovery',
        };

      default:
        return {
          responseBody:
            'Recibido. Si quieres avanzar con la propuesta o tienes alguna pregunta específica, dime y te ayudo. También puedo pasarte con un asesor humano si lo prefieres.',
          responseSource: 'default-auto-reply',
        };
    }
  }
}
