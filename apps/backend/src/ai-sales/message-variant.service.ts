import { Injectable } from '@nestjs/common';

export type GreetingVariant = 'first_contact' | 'returning_contact';
export type ReadyForQuoteVariant = 'enthusiastic' | 'professional' | 'casual' | 'urgency' | 'value_focused';
export type ReviewStatusVariant = 'pending_owner_review' | 'changes_requested' | 'delivered_to_customer';

/**
 * Message variants for greeting messages
 * Provides natural, varied greetings based on conversation context
 */
const GREETING_VARIANTS: Record<GreetingVariant, string[]> = {
  first_contact: [
    '¿Qué proyecto tienes en mente? Me cuentas y vemos cómo te podemos ayudar.',
    '¡Hola! Cuéntame sobre tu proyecto — me interesa escuchar qué quieres construir.',
    '¿Buscas cotizar algo o quieres conocer primero cómo trabajamos?',
    '¿Qué necesitas construir? Me interesa escuchar tu idea.',
    'Hola — ¿qué proyecto te trae por aquí?',
  ],
  returning_contact: [
    '¡Hola de nuevo! ¿Seguimos con lo mismo o hay algo nuevo en el radar?',
    '¿Cómo vas? ¿Avanzamos con lo que hablamos o surge algo más?',
    'Bueno verte de nuevo. ¿Continuamos con la cotización anterior o evaluamos algo diferente?',
    '¿Qué tal? ¿Tienes novedades sobre el proyecto que conversamos?',
  ],
};

/**
 * Message variants for ready-for-quote state
 * Uses neurosales techniques: soft close, urgency, value focus
 */
const READY_FOR_QUOTE_VARIANTS: Record<ReadyForQuoteVariant, string> = {
  enthusiastic:
    '¡Excelente! Ya tengo claro el alcance. Preparo una propuesta preliminar y te la envío en las próximas horas. Si se te ocurre algo más que quieras incluir, aún puedes agregarlo.',
  professional:
    'Perfecto, tengo suficiente información para armar un borrador. Lo preparo y te aviso cuando esté listo para revisión. Si quieres ajustar algo, este es el momento.',
  casual:
    'Listo, ya entendí lo que necesitas. Voy a estructurar una propuesta y te la comparto pronto. Si se te pasa algo por la cabeza, escríbeme antes de que la cierre.',
  urgency:
    'Perfecto, ya tengo todo. Como mencionaste el timing apretado, preparo la propuesta hoy mismo y te la envío lo antes posible. ¿Hay algo más que deba considerar antes de cerrarla?',
  value_focused:
    'Tiene sentido lo que me cuentas. Voy a cotizar {projectType} con los datos que me diste. Preparo una propuesta que se ajuste a tus necesidades y te la envío para revisar.',
};

/**
 * Message variants for review status replies
 * Provides contextual responses based on quote status
 */
const REVIEW_STATUS_VARIANTS: Record<ReviewStatusVariant, string[]> = {
  pending_owner_review: [
    'Tu propuesta está en revisión interna. Usualmente tardamos 24-48h. Te aviso en cuanto tenga novedades.',
    'Estoy esperando feedback del equipo técnico. ¿Hay algo más que quieras agregar mientras tanto?',
    'La propuesta está siendo revisada por el equipo. Te contacto en cuanto tenga una respuesta.',
  ],
  changes_requested: [
    'Estoy ajustando la propuesta con los cambios que pediste. ¿Algo más que deba considerar?',
    'Perfecto, hago las modificaciones que solicitaste. ¿Hay algún otro detalle que quieras ajustar?',
  ],
  delivered_to_customer: [
    '¿Qué te pareció la propuesta? ¿Tienes dudas o quieres ajustar algo?',
    '¿Avanzamos con lo que enviamos o necesitas que revisemos algún punto?',
    '¿Te quedó clara la propuesta? Estoy atento por si necesitas aclarar algo o hacer ajustes.',
  ],
};

/**
 * Discovery reply acknowledgments - varied alternatives to "Perfecto"
 */
const DISCOVERY_ACKNOWLEDGMENTS = [
  'Vale',
  'Entiendo',
  'Claro',
  'Interesante',
  'Suena bien',
  'Tiene sentido',
  'Buenísimo',
  'Ok',
  'Dale',
  'Genial',
];

@Injectable()
export class MessageVariantService {
  /**
   * Select a greeting message variant
   * Uses conversationId hash for consistency across retries
   */
  getGreetingVariant(variant: GreetingVariant, conversationId: string): string {
    const variants = GREETING_VARIANTS[variant];
    const index = this.hashStringToIndex(conversationId, variants.length);
    return variants[index];
  }

  /**
   * Select a ready-for-quote message variant
   * Chooses based on conversation context (budget, urgency, etc.)
   */
  getReadyForQuoteVariant(
    projectType: string | null,
    options: {
      hasUrgency?: boolean;
      hasBudget?: boolean;
      conversationId: string;
    },
  ): string {
    let variant: ReadyForQuoteVariant;

    // Select variant based on context
    if (options.hasUrgency) {
      variant = 'urgency';
    } else if (!options.hasBudget) {
      variant = 'value_focused';
    } else {
      // Use hash for variety when no specific context applies
      const variants: ReadyForQuoteVariant[] = ['enthusiastic', 'professional', 'casual', 'value_focused'];
      variant = variants[this.hashStringToIndex(options.conversationId, variants.length)];
    }

    let message = READY_FOR_QUOTE_VARIANTS[variant];
    const projectLabel = projectType?.trim() || 'tu proyecto';
    
    // Replace placeholder if present
    message = message.replace(/{projectType}/g, projectLabel);

    return message;
  }

  /**
   * Select a review status message variant
   */
  getReviewStatusVariant(status: ReviewStatusVariant, conversationId: string): string {
    const variants = REVIEW_STATUS_VARIANTS[status];
    const index = this.hashStringToIndex(conversationId, variants.length);
    return variants[index];
  }

  /**
   * Get a varied acknowledgment for discovery replies
   * Avoids repetitive "Perfecto"
   */
  getDiscoveryAcknowledgment(messageIndex: number = 0): string {
    const index = messageIndex % DISCOVERY_ACKNOWLEDGMENTS.length;
    return DISCOVERY_ACKNOWLEDGMENTS[index];
  }

  /**
   * Hash a string to a consistent index
   * Provides deterministic but distributed selection
   */
  private hashStringToIndex(str: string, max: number): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) % max;
  }
}
