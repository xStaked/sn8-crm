import { Injectable, Logger } from '@nestjs/common';
import type { QuoteReviewStatus } from '@prisma/client';
import { MessageVariantService } from './message-variant.service';

export type FollowUpContext = {
  conversationId: string;
  reviewStatus: QuoteReviewStatus;
  customerName?: string | null;
  projectType?: string | null;
  daysSinceLastContact?: number;
  previousFollowUps?: number;
};

export type FollowUpResult = {
  message: string;
  shouldEscalate: boolean;
  followUpType: 'status_update' | 'gentle_nudge' | 'value_add' | 'closing_attempt';
};

/**
 * Service for managing post-quotation follow-up messages
 * Implements neurosales techniques for re-engagement
 */
@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);

  constructor(private readonly messageVariantService: MessageVariantService) {}

  /**
   * Generate a follow-up message based on context
   */
  generateFollowUp(context: FollowUpContext): FollowUpResult {
    const { reviewStatus, daysSinceLastContact = 0, previousFollowUps = 0 } = context;

    // Determine follow-up strategy based on status and timing
    if (reviewStatus === 'delivered_to_customer') {
      return this.generateDeliveredFollowUp(context);
    }

    if (reviewStatus === 'pending_owner_review') {
      return this.generatePendingFollowUp(context);
    }

    if (reviewStatus === 'changes_requested') {
      return this.generateChangesFollowUp(context);
    }

    // Default for other statuses
    return {
      message: this.messageVariantService.getReviewStatusVariant(
        'pending_owner_review',
        context.conversationId,
      ),
      shouldEscalate: false,
      followUpType: 'status_update',
    };
  }

  /**
   * Generate follow-up for delivered quotes
   * Uses progressive engagement: gentle → value-add → closing
   */
  private generateDeliveredFollowUp(context: FollowUpContext): FollowUpResult {
    const { conversationId, previousFollowUps = 0, daysSinceLastContact = 0 } = context;

    // Progressive follow-up strategy
    if (previousFollowUps === 0) {
      // First follow-up: gentle check-in
      const variants = [
        '¿Qué te pareció la propuesta? ¿Tienes dudas o quieres ajustar algo?',
        '¿Tuviste chance de revisar la propuesta? Estoy atento a tus comentarios.',
        '¿Te quedó claro todo en la propuesta? Puedo aclarar cualquier punto.',
      ];
      return {
        message: this.selectVariant(variants, conversationId),
        shouldEscalate: false,
        followUpType: 'gentle_nudge',
      };
    }

    if (previousFollowUps === 1 && daysSinceLastContact > 3) {
      // Second follow-up: add value
      const variants = [
        'Si te interesa avanzar, puedo agendar una breve llamada para aclarar dudas. También puedo ajustar el alcance si el presupuesto es un tema.',
        'Entiendo que estas evaluando opciones. Si quieres, puedo preparar un comparativo de escenarios (MVP vs full) para que veas las diferencias de inversión.',
        '¿Hay algún punto técnico que no haya quedado claro? Puedo conectarte con el lead técnico para una consulta rápida sin compromiso.',
      ];
      return {
        message: this.selectVariant(variants, conversationId),
        shouldEscalate: false,
        followUpType: 'value_add',
      };
    }

    if (previousFollowUps >= 2 && daysSinceLastContact > 7) {
      // Third+ follow-up: soft close or escalate
      const variants = [
        'No quiero ser insistente, pero tampoco quiero que se pierda esta oportunidad si te interesa. ¿Prefieres que lo dejemos por ahora y te contacto en un par de semanas?',
        '¿Hay algo que te esté frenando para avanzar? A veces es el presupuesto, otras el timing. Si me cuentas, puedo ver si hay algo ajustable.',
      ];
      return {
        message: this.selectVariant(variants, conversationId),
        shouldEscalate: previousFollowUps >= 3,
        followUpType: 'closing_attempt',
      };
    }

    // Default status update
    return {
      message: this.messageVariantService.getReviewStatusVariant(
        'delivered_to_customer',
        conversationId,
      ),
      shouldEscalate: false,
      followUpType: 'status_update',
    };
  }

  /**
   * Generate follow-up for pending owner review
   */
  private generatePendingFollowUp(context: FollowUpContext): FollowUpResult {
    const { conversationId, daysSinceLastContact = 0 } = context;

    if (daysSinceLastContact > 2) {
      const variants = [
        'Tu propuesta sigue en revisión interna. Te aviso en cuanto tenga novedades — usualmente tardamos 24-48h.',
        'Estoy pendiente del feedback del equipo técnico. ¿Hay algo más que quieras agregar mientras tanto?',
      ];
      return {
        message: this.selectVariant(variants, conversationId),
        shouldEscalate: daysSinceLastContact > 5,
        followUpType: 'status_update',
      };
    }

    return {
      message: this.messageVariantService.getReviewStatusVariant(
        'pending_owner_review',
        conversationId,
      ),
      shouldEscalate: false,
      followUpType: 'status_update',
    };
  }

  /**
   * Generate follow-up for changes requested
   */
  private generateChangesFollowUp(context: FollowUpContext): FollowUpResult {
    const { conversationId, daysSinceLastContact = 0 } = context;

    if (daysSinceLastContact > 1) {
      const variants = [
        'Estoy trabajando en los ajustes que pediste. ¿Algo más que deba considerar antes de cerrar la nueva versión?',
        '¿Hay algún otro detalle que quieras ajustar mientras preparo la propuesta modificada?',
      ];
      return {
        message: this.selectVariant(variants, conversationId),
        shouldEscalate: false,
        followUpType: 'status_update',
      };
    }

    return {
      message: this.messageVariantService.getReviewStatusVariant(
        'changes_requested',
        conversationId,
      ),
      shouldEscalate: false,
      followUpType: 'status_update',
    };
  }

  /**
   * Select a variant based on conversationId hash
   */
  private selectVariant(variants: string[], conversationId: string): string {
    const index = this.hashStringToIndex(conversationId, variants.length);
    return variants[index];
  }

  /**
   * Hash a string to a consistent index
   */
  private hashStringToIndex(str: string, max: number): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) % max;
  }

  /**
   * Determine if a follow-up should be sent based on timing
   */
  shouldSendFollowUp(
    lastContactDate: Date,
    reviewStatus: QuoteReviewStatus,
    previousFollowUps: number,
  ): boolean {
    const now = new Date();
    const daysSinceContact = Math.floor(
      (now.getTime() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Different thresholds based on status
    switch (reviewStatus) {
      case 'delivered_to_customer':
        // Follow up after 2 days, then every 3-4 days
        if (previousFollowUps === 0) return daysSinceContact >= 2;
        if (previousFollowUps === 1) return daysSinceContact >= 5;
        if (previousFollowUps >= 2) return daysSinceContact >= 9;
        return false;

      case 'pending_owner_review':
        // Follow up after 2 days if still pending
        return daysSinceContact >= 2 && previousFollowUps === 0;

      case 'changes_requested':
        // Follow up after 1 day if changes are being worked on
        return daysSinceContact >= 1 && previousFollowUps === 0;

      default:
        return false;
    }
  }
}
