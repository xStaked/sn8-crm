import { Injectable, Logger } from '@nestjs/common';

export type ConversationQualityInput = {
  userMessage: string;
  botResponse: string;
  context: {
    intent: string;
    confidence: number;
    messageCount: number;
    hasBrief: boolean;
    hasDraft: boolean;
    sameResponseCount: number;
  };
};

export type QualityCheckResult = {
  isHealthy: boolean;
  issues: ConversationIssue[];
  recommendations: string[];
  shouldEscalate: boolean;
};

export type ConversationIssue = {
  type: 'low_confidence' | 'repetitive_response' | 'off_track' | 'user_confusion' | 'frustration_detected';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
};

@Injectable()
export class ConversationQualityCheckerService {
  private readonly logger = new Logger(ConversationQualityCheckerService.name);

  private readonly CONFIDENCE_THRESHOLD = 0.6;
  private readonly REPETITIVE_RESPONSE_THRESHOLD = 3;
  private readonly MAX_DISCOVERY_ROUNDS = 8;

  checkQuality(input: ConversationQualityInput): QualityCheckResult {
    const issues: ConversationIssue[] = [];
    const recommendations: string[] = [];

    // Check 1: Low confidence in intent detection
    if (input.context.confidence < this.CONFIDENCE_THRESHOLD) {
      issues.push({
        type: 'low_confidence',
        severity: 'medium',
        description: `Baja confianza en detección de intent: ${input.context.confidence.toFixed(2)}`,
      });
      recommendations.push('Considerar pedir clarificación al usuario');
    }

    // Check 2: Repetitive responses
    if (input.context.sameResponseCount >= this.REPETITIVE_RESPONSE_THRESHOLD) {
      issues.push({
        type: 'repetitive_response',
        severity: 'high',
        description: `Respuesta repetida ${input.context.sameResponseCount} veces`,
      });
      recommendations.push('Cambiar estrategia de respuesta o escalar a humano');
    }

    // Check 3: Conversation going off-track (too many discovery rounds)
    if (input.context.hasBrief === false && input.context.messageCount > this.MAX_DISCOVERY_ROUNDS) {
      issues.push({
        type: 'off_track',
        severity: 'high',
        description: `Conversación lleva ${input.context.messageCount} rondas sin completar brief`,
      });
      recommendations.push('El brief no se está completando - considerar intervención humana');
    }

    // Check 4: User confusion patterns
    if (this.detectsUserConfusion(input.userMessage)) {
      issues.push({
        type: 'user_confusion',
        severity: 'medium',
        description: 'Usuario muestra confusión sobre el proyecto o contexto',
      });
      recommendations.push('Proporcionar clarificación inmediata del contexto');
    }

    // Check 5: Frustration detection
    if (this.detectsFrustration(input.userMessage)) {
      issues.push({
        type: 'frustration_detected',
        severity: 'critical',
        description: 'Detectada frustración en el mensaje del usuario',
      });
      recommendations.push('Escalar inmediatamente a humano');
    }

    // Determine overall health
    const hasCriticalIssues = issues.some((i) => i.severity === 'critical');
    const hasHighIssues = issues.some((i) => i.severity === 'high');
    const isHealthy = issues.length === 0;
    const shouldEscalate = hasCriticalIssues || (hasHighIssues && input.context.messageCount > 5);

    if (isHealthy) {
      recommendations.push('Conversación saludable - continuar normalmente');
    }

    return {
      isHealthy,
      issues,
      recommendations,
      shouldEscalate,
    };
  }

  private detectsUserConfusion(message: string): boolean {
    const confusionPatterns = [
      /de qu[eé] proyecto/i,
      /no entiendo/i,
      /qu[eé] es esto/i,
      /de qu[eé] hablamos/i,
      /no habl[eé] de/i,
      /no ped[ií]/i,
      /qu[eé] cotizaci[óo]n/i,
      /qu[eé] propuesta/i,
      /no es mio/i,
      /no es mi/i,
      /error/i,
      /equivocad/i,
      /cuentame/i,
      /explicate/i,
      /c[oó]mo as[ií]/i,
      /qu[eé] hablas/i,
      /de qu[eé] hablas/i,
      /no te entiendo/i,
      /a qu[eé] te refieres/i,
      /no me suena/i,
      /eso no es/i,
      /eso no tiene/i,
      /qu[eé] tiene que ver/i,
    ];

    return confusionPatterns.some((pattern) => pattern.test(message));
  }

  private detectsFrustration(message: string): boolean {
    const frustrationPatterns = [
      /hpta/i,
      /hp/i,
      /mierda/i,
      /carajo/i,
      /puta/i,
      /estupido/i,
      /est[uú]pido/i,
      /pendejo/i,
      /imb[eé]cil/i,
      /idiota/i,
      /no funciona/i,
      /no sirve/i,
      /pesimo/i,
      /p[eé]simo/i,
      /malo/i,
      /p[eé]sima atenci[oó]n/i,
      /horrible/i,
      /terrible/i,
    ];

    return frustrationPatterns.some((pattern) => pattern.test(message));
  }

  /**
   * Get health summary for logging/monitoring
   */
  getHealthSummary(result: QualityCheckResult): string {
    if (result.isHealthy) {
      return '✅ Conversación saludable';
    }

    const severityCounts = result.issues.reduce(
      (acc, issue) => {
        acc[issue.severity] = (acc[issue.severity] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const parts = Object.entries(severityCounts).map(
      ([severity, count]) => `${count} ${severity}`,
    );

    return `⚠️ Problemas detectados: ${parts.join(', ')} | ${result.issues.length} issues total`;
  }
}
