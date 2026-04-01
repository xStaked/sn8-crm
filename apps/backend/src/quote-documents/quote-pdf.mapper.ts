type QuotePdfSourceRecord = Record<string, unknown>;

type QuotePdfSection = {
  label: string;
  content: string;
};

type QuotePdfCommercialBrief = {
  customerName: string | null;
  projectType: string | null;
  summary: string | null;
  budget: string | null;
  urgency: string | null;
};

export type QuotePdfDraftSource = {
  id: string;
  conversationId: string;
  version: number;
  reviewStatus: string;
  createdAt: Date;
  renderedQuote: string | null;
  draftPayload: unknown;
  commercialBrief: QuotePdfCommercialBrief;
};

export type QuotePdfDocumentModel = {
  fileName: string;
  documentTitle: string;
  quoteTitle: string;
  versionLabel: string;
  generatedAtLabel: string;
  customerLabel: string;
  projectLabel: string;
  summaryLabel: string;
  projectSummary: string;
  pricingLabel: string;
  pricingSummary: string;
  reviewStatusLabel: string;
  sections: QuotePdfSection[];
  footerLines: string[];
};

function isRecord(value: unknown): value is QuotePdfSourceRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readStructuredSections(draftPayload: unknown): QuotePdfSection[] {
  if (!isRecord(draftPayload)) {
    return [];
  }

  const structuredDraft = draftPayload.structuredDraft;
  if (!isRecord(structuredDraft)) {
    return [];
  }

  const ownerReviewDraft = structuredDraft.ownerReviewDraft;
  if (!isRecord(ownerReviewDraft) || !Array.isArray(ownerReviewDraft.sections)) {
    return [];
  }

  return ownerReviewDraft.sections
    .filter(isRecord)
    .map((section) => ({
      label: asNonEmptyString(section.label) ?? 'Seccion',
      content: asNonEmptyString(section.content) ?? 'Sin detalle disponible.',
    }))
    .filter((section) => section.content.length > 0);
}

function readOwnerReviewTitle(draftPayload: unknown): string | null {
  if (!isRecord(draftPayload) || !isRecord(draftPayload.structuredDraft)) {
    return null;
  }

  return asNonEmptyString(draftPayload.structuredDraft.ownerReviewDraft && isRecord(draftPayload.structuredDraft.ownerReviewDraft)
    ? draftPayload.structuredDraft.ownerReviewDraft.title
    : null);
}

function readPendingReviewLabel(draftPayload: unknown): string | null {
  if (!isRecord(draftPayload) || !isRecord(draftPayload.structuredDraft)) {
    return null;
  }

  return asNonEmptyString(draftPayload.structuredDraft.ownerReviewDraft && isRecord(draftPayload.structuredDraft.ownerReviewDraft)
    ? draftPayload.structuredDraft.ownerReviewDraft.pendingReviewLabel
    : null);
}

function readDraftSummary(draftPayload: unknown): string | null {
  if (!isRecord(draftPayload)) {
    return null;
  }

  return asNonEmptyString(draftPayload.summary);
}

function formatColombiaDate(date: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'long',
    timeZone: 'America/Bogota',
  }).format(date);
}

function sanitizeConversationId(conversationId: string): string {
  return conversationId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sin-conversacion';
}

function extractPricingSummary(
  sections: QuotePdfSection[],
  brief: QuotePdfCommercialBrief,
): string {
  const pricingSection = sections.find((section) =>
    /(precio|inversion|inversi[oó]n|total|valor|presupuesto)/i.test(section.label),
  );

  if (pricingSection) {
    return pricingSection.content;
  }

  if (asNonEmptyString(brief.budget)) {
    return `Presupuesto de referencia: ${brief.budget}`;
  }

  return 'Por definir en revision';
}

export function mapQuoteDraftToPdfDocument(
  draft: QuotePdfDraftSource,
): QuotePdfDocumentModel {
  const sections = readStructuredSections(draft.draftPayload);
  const summary =
    readDraftSummary(draft.draftPayload) ??
    asNonEmptyString(draft.commercialBrief.summary) ??
    asNonEmptyString(draft.renderedQuote) ??
    'Sin resumen comercial disponible.';

  const quoteTitle =
    readOwnerReviewTitle(draft.draftPayload) ??
    `Propuesta para ${draft.commercialBrief.customerName ?? draft.conversationId}`;
  const pendingReviewLabel =
    readPendingReviewLabel(draft.draftPayload) ??
    'Documento generado para revision interna de SN8 Labs. No enviar al cliente sin aprobacion.';

  return {
    fileName: `cotizacion-sn8-${sanitizeConversationId(draft.conversationId)}-v${draft.version}.pdf`,
    documentTitle: 'Cotizacion Comercial',
    quoteTitle,
    versionLabel: `Version ${draft.version}`,
    generatedAtLabel: formatColombiaDate(draft.createdAt),
    customerLabel: draft.commercialBrief.customerName ?? draft.conversationId,
    projectLabel: draft.commercialBrief.projectType ?? 'Proyecto de software',
    summaryLabel: draft.commercialBrief.urgency
      ? `Urgencia: ${draft.commercialBrief.urgency}`
      : 'Resumen ejecutivo',
    projectSummary: summary,
    pricingLabel: 'Inversion estimada',
    pricingSummary: extractPricingSummary(sections, draft.commercialBrief),
    reviewStatusLabel: pendingReviewLabel,
    sections:
      sections.length > 0
        ? sections
        : [
            {
              label: 'Propuesta comercial',
              content:
                asNonEmptyString(draft.renderedQuote) ??
                'Sin contenido renderizado disponible para esta version.',
            },
          ],
    footerLines: [
      'Documento para revision interna y aprobacion comercial de SN8 Labs.',
      'Los valores y alcances aqui descritos corresponden a la version indicada de la cotizacion.',
      'La entrega al cliente final solo puede ocurrir a traves del flujo aprobado por OwnerReviewService.',
    ],
  };
}
