import type { CommercialBrief, QuoteDraft } from '@prisma/client';
import type { SalesGraphBriefStatus, SalesGraphQuoteReviewStatus } from './sales-graph.types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MergedBrief = {
  customerName: string | null;
  projectType: string | null;
  businessProblem: string | null;
  desiredScope: string | null;
  budget: string | null;
  urgency: string | null;
  constraints: string | null;
  summary: string | null;
};

type ExtractedMissingField =
  | 'customerName'
  | 'projectType'
  | 'businessProblem'
  | 'desiredScope'
  | 'budget'
  | 'urgency'
  | 'constraints';

export const CORE_BRIEF_FIELDS = ['projectType', 'businessProblem', 'desiredScope'] as const;
export const OPTIONAL_BRIEF_FIELDS = ['budget', 'urgency', 'constraints'] as const;

const MISSING_FIELD_HINTS: Record<ExtractedMissingField, RegExp[]> = {
  customerName: [/nombre/i, /como prefieres que te llame/i],
  projectType: [/tipo de proyecto/i, /tipo de solucion/i, /project type/i],
  businessProblem: [/problema/i, /objetivo principal/i, /que quieres resolver/i],
  desiredScope: [/alcance/i, /mvp/i, /primera version/i, /funciones clave/i],
  budget: [/presupuesto/i, /budget/i, /rango/i],
  urgency: [/urgencia/i, /fecha objetivo/i, /timeline/i, /tiempo/i],
  constraints: [/restricciones/i, /integraciones/i, /tecnologia/i, /constraint/i],
};

// ---------------------------------------------------------------------------
// Sanitization helpers
// ---------------------------------------------------------------------------

export function looksLikeMissingPlaceholder(value: string): boolean {
  return /(falta|faltan|missing|pendiente|por definir|por confirmar|sin definir|no especificado|no proporcionado|desconocido|informacion adicional|información adicional|se requiere|hace falta)/i.test(
    value,
  );
}

export function sanitizeBriefValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (looksLikeMissingPlaceholder(normalized)) return null;
  return normalized;
}

export function hasMeaningfulBriefValue(value: string | null | undefined): boolean {
  return sanitizeBriefValue(value) !== null;
}

export function pickMeaningfulValue(
  primary: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  return sanitizeBriefValue(primary) ?? sanitizeBriefValue(fallback);
}

export function normalizeBudgetValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (/(no tengo presupuesto|no sé|no se|dime el precio|dime cuanto|cual es el precio|cuanto cuesta|a definir|por definir|me dices tu|tu me dices)/i.test(normalized)) {
    return 'a definir con SN8';
  }
  if (/(no importa|abierto|flexible|sin tope|lo vemos)/i.test(normalized)) {
    return 'presupuesto abierto';
  }
  return looksLikeMissingPlaceholder(normalized) ? null : normalized;
}

export function normalizeUrgencyValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (/(no tengo prisa|no hay afán|no hay afan|cuando esté|cuando este|sin fecha|flexible|cuando puedas|no urgente)/i.test(normalized)) {
    return 'flexible';
  }
  return looksLikeMissingPlaceholder(normalized) ? null : normalized;
}

export function mergeBudgetValue(
  primary: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  return normalizeBudgetValue(primary) ?? normalizeBudgetValue(fallback);
}

export function mergeUrgencyValue(
  primary: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  return normalizeUrgencyValue(primary) ?? normalizeUrgencyValue(fallback);
}

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

export function detectsNewProjectIntent(body: string | null): boolean {
  if (!body) return false;
  const newProjectPatterns = [
    /cotizar\s+proyecto/i, /cotizar\s+propuesta/i,  // Button text: "Cotizar proyecto"
    /otro proyecto/i, /otra cosa/i, /otra aplicaci[oó]n/i, /otro sistema/i,
    /nueva? cotizaci[oó]n/i, /nuevo proyecto/i, /nueva? propuesta/i,
    /empezar de nuevo/i, /empezar de cero/i, /cotizar otro/i, /cotizar otra/i,
    /quiero\s+cotizar/i,                             // "Quiero cotizar" without "otro"
    /diferente proyecto/i, /pidiendo otra/i, /quiero otra/i, /es otro/i,
    /es diferente/i, /cambiar de proyecto/i, /cambiar el proyecto/i,
    /no es ese proyecto/i, /no es ese/i, /no quiero eso/i, /no es lo que quiero/i,
    /hablar de otra cosa/i, /hablamos de otra cosa/i,
  ];
  return newProjectPatterns.some((p) => p.test(body));
}

export type UserIntent =
  | 'confused_about_project'
  | 'asking_for_clarification'
  | 'wants_new_project'
  | 'continuing';

export function detectUserIntent(body: string | null): UserIntent {
  if (!body) return 'continuing';
  const confusionPatterns = [
    /de qu[eé] proyecto/i, /informaci[óo]n de qu[eé]/i, /no entiendo/i,
    /qu[eé] es esto/i, /de qu[eé] hablamos/i, /no habl[eé] de/i,
    /no ped[ií]/i, /qu[eé] cotizaci[óo]n/i,
    /cu[aá]l\s+(propuesta|cotizaci[oó]n|proyecto)/i,  // "cual propuesta?"
    /qu[eé] propuesta/i,
    /no es mio/i, /no es mi/i, /error/i, /equivocad/i,
    /cuentame/i, /explicate/i, /c[oó]mo as[ií]/i,
    /qu[eé] hablas/i, /de qu[eé] hablas/i, /no te entiendo/i,
    /a qu[eé] te refieres/i, /no me suena/i, /eso no es/i,
    /eso no tiene/i, /qu[eé] tiene que ver/i,
  ];
  if (confusionPatterns.some((p) => p.test(body))) return 'confused_about_project';
  if (detectsNewProjectIntent(body)) return 'wants_new_project';
  return 'continuing';
}

// ---------------------------------------------------------------------------
// Missing fields
// ---------------------------------------------------------------------------

export function resolveExtractedMissingFields(
  missingInformation: string[] | undefined,
): Set<ExtractedMissingField> {
  const resolved = new Set<ExtractedMissingField>();
  for (const item of missingInformation ?? []) {
    for (const [field, patterns] of Object.entries(MISSING_FIELD_HINTS) as Array<
      [ExtractedMissingField, RegExp[]]
    >) {
      if (patterns.some((p) => p.test(item))) {
        resolved.add(field);
      }
    }
  }
  return resolved;
}

export function estimateMissingFields(
  brief: (Partial<CommercialBrief> & { projectType?: string | null; businessProblem?: string | null; desiredScope?: string | null }) | null,
): string[] {
  if (!brief) return [...CORE_BRIEF_FIELDS];
  return [...CORE_BRIEF_FIELDS, ...OPTIONAL_BRIEF_FIELDS].filter(
    (field) => !hasMeaningfulBriefValue((brief as Record<string, unknown>)[field] as string | null),
  );
}

// ---------------------------------------------------------------------------
// Draft helpers
// ---------------------------------------------------------------------------

export function safeJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function isDraftArchived(payload: unknown): boolean {
  const payloadObj = safeJsonObject(payload);
  const lifecycle = safeJsonObject(payloadObj.lifecycle);
  return typeof lifecycle.archivedAt === 'string' && lifecycle.archivedAt.trim().length > 0;
}

export function pickLatestActiveDraft(drafts: QuoteDraft[]): QuoteDraft | null {
  for (const draft of drafts) {
    if (!isDraftArchived(draft.draftPayload)) return draft;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Status mappers
// ---------------------------------------------------------------------------

export function mapBriefStatus(
  status: CommercialBrief['status'] | undefined,
): SalesGraphBriefStatus | undefined {
  if (status === 'collecting' || status === 'ready_for_quote' || status === 'quote_in_review') {
    return status;
  }
  return undefined;
}

export function mapQuoteReviewStatus(
  status: QuoteDraft['reviewStatus'] | undefined,
): SalesGraphQuoteReviewStatus | undefined {
  if (
    status === 'pending_owner_review' ||
    status === 'changes_requested' ||
    status === 'approved' ||
    status === 'delivered_to_customer'
  ) {
    return status;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Brief summary
// ---------------------------------------------------------------------------

export function buildBriefSummary(
  brief: Partial<Pick<CommercialBrief, 'projectType' | 'businessProblem' | 'summary'>> | null,
): string {
  if (!brief) return 'proyecto no identificado';
  const parts: string[] = [];
  if (brief.projectType) parts.push(brief.projectType);
  if (brief.businessProblem) {
    const short =
      brief.businessProblem.length > 50
        ? brief.businessProblem.substring(0, 50) + '...'
        : brief.businessProblem;
    parts.push(`para ${short}`);
  }
  if (parts.length === 0 && brief.summary) {
    return brief.summary.length > 60
      ? brief.summary.substring(0, 60) + '...'
      : brief.summary;
  }
  return parts.join(' ') || 'proyecto en definición';
}

// ---------------------------------------------------------------------------
// Conversation context extraction
// ---------------------------------------------------------------------------

export function extractConversationContext(transcript: string): {
  previousTopics: string[];
  customerTone: 'formal' | 'casual' | 'technical';
  expressedConcerns: string[];
} | null {
  try {
    const topics: string[] = [];
    const concerns: string[] = [];

    const topicMatches = transcript.match(
      /(?:CRM|app|aplicación|sistema|web|mobile|ecommerce|automatización|dashboard|API|integración|whatsapp|instagram|redes|cloud|servidor)/gi,
    );
    if (topicMatches) {
      topics.push(...new Set(topicMatches.map((t) => t.toLowerCase())));
    }

    if (/presupuesto|costo|precio|barato|caro|dinero/i.test(transcript)) concerns.push('presupuesto');
    if (/tiempo|urgencia|ya|pronto|fecha|demora|lento/i.test(transcript)) concerns.push('tiempo');
    if (/complejo|difícil|imposible|no se puede|problema/i.test(transcript)) concerns.push('complejidad');
    if (/tecnología|stack|lenguaje|plataforma|hosting/i.test(transcript)) concerns.push('tecnología');

    let tone: 'formal' | 'casual' | 'technical' = 'casual';
    if (/api|endpoint|database|frontend|backend|deploy|server|json|rest|graphql/i.test(transcript)) {
      tone = 'technical';
    } else if (/usted|estimado|cordial|saludos|atentamente|empresa/i.test(transcript)) {
      tone = 'formal';
    }

    if (topics.length === 0 && concerns.length === 0) return null;

    return {
      previousTopics: topics.slice(0, 5),
      customerTone: tone,
      expressedConcerns: concerns,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function looksLikeLargePlatformRequest(brief: Partial<MergedBrief>): boolean {
  const scopeText =
    `${brief.projectType || ''} ${brief.desiredScope || ''} ${brief.businessProblem || ''}`.toLowerCase();
  const patterns = [
    /plataforma completa/i, /sistema completo/i, /multi[\s-]?modul/i, /enterprise/i,
    /todo en uno/i, /marketplace/i, /saas/i, /erp/i, /crm/i,
    /app movil/i, /aplicacion movil/i,
  ];
  return patterns.some((p) => p.test(scopeText));
}

export function hashStringToIndex(str: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % max;
}

export function buildStaticDiscoveryFallback(
  missingField: string,
  isFirstTouch: boolean,
  projectType: string | null,
): string {
  const intro = isFirstTouch ? 'Hola, soy el asesor comercial de SN8 Labs.' : 'Sigo contigo.';
  const questions: Record<string, string> = {
    projectType: '¿Qué tipo de solución quieres construir?',
    businessProblem: '¿Cuál es el problema principal que quieres resolver?',
    desiredScope: projectType
      ? `¿Qué debe incluir la primera versión de ese ${projectType}?`
      : '¿Qué funciones clave debe tener la primera versión?',
    budget: '¿Qué rango de presupuesto manejas?',
    urgency: '¿Tienes fecha objetivo o ventana para arrancar?',
    constraints: '¿Hay alguna restricción importante que deba considerar?',
  };
  return `${intro} ${questions[missingField] ?? '¿Puedes contarme más sobre lo que necesitas?'}`;
}
