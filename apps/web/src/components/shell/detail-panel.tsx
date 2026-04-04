"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  MessageSquare,
  MoreVertical,
  Paperclip,
  PencilLine,
  Phone,
  Send,
  SmilePlus,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversationMessages } from "@/hooks/use-conversation-messages";
import { useConversationQuoteReview } from "@/hooks/use-conversation-quote-review";
import { useConversations } from "@/hooks/use-conversations";
import { apiFetch, apiFetchJson, isApiError } from "@/lib/api";
import type {
  ConversationControlMode,
  ConversationControlState,
  ConversationMessageDto,
  ConversationQuoteReview,
  ConversationQuoteReviewDto,
} from "@/types/conversation";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatTimestamp(isoString: string) {
  return new Date(isoString).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCurrency(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/D";
  }

  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTimeOnly(isoString: string) {
  return new Date(isoString).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseNumericInput(value: string): number | null {
  const normalized = value.replace(/[^\d.,-]/g, "").replace(",", ".").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getReviewStatusLabel(status: ConversationQuoteReview["reviewStatus"]) {
  switch (status) {
    case "pending_owner_review":
      return "Pendiente de aprobacion";
    case "ready_for_recheck":
      return "Lista para revalidacion";
    case "changes_requested":
      return "Cambios solicitados";
    case "approved":
      return "Aprobada";
    case "delivered_to_customer":
      return "Entregada al cliente";
    default:
      return status;
  }
}

function getReviewStatusTone(status: ConversationQuoteReview["reviewStatus"]) {
  switch (status) {
    case "pending_owner_review":
    case "ready_for_recheck":
      return "tone-warning";
    case "changes_requested":
      return "tone-info";
    case "approved":
      return "tone-success";
    case "delivered_to_customer":
      return "tone-success";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function isQuoteReviewActionable(status: ConversationQuoteReview["reviewStatus"]) {
  return status === "pending_owner_review" || status === "ready_for_recheck";
}

function getControlLabel(mode: ConversationControlMode): string {
  switch (mode) {
    case "human_control":
      return "Human takeover";
    case "pending_resume":
      return "Ready to resume AI";
    case "ai_control":
    default:
      return "AI managed";
  }
}

function getControlTone(mode: ConversationControlMode): string {
  switch (mode) {
    case "human_control":
      return "tone-warning border";
    case "pending_resume":
      return "tone-info border";
    case "ai_control":
    default:
      return "tone-success border";
  }
}

function getControlStateLabel(state: ConversationControlState): string {
  switch (state) {
    case "GREETING":
      return "Saludo inicial";
    case "INFO_SERVICES":
      return "Mostrando servicios";
    case "QUALIFYING":
      return "Calificacion IA";
    case "HUMAN_HANDOFF":
      return "En handoff humano";
    case "AI_SALES":
      return "IA comercial";
    default:
      return state;
  }
}

function QuoteReviewSkeleton() {
  return (
    <div className="border-b border-border px-6 py-5">
      <div className="space-y-3 rounded-2xl border border-border bg-card/70 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}

function QuoteReviewCard({
  quoteReview,
  requestChangesMode,
  requestChangesFeedback,
  reviewError,
  reviewSubmitting,
  pdfOpening,
  onRequestChangesFeedbackChange,
  onToggleRequestChanges,
  adjustmentsMode,
  adjustmentReason,
  adjustmentAssumptions,
  adjustmentMinAmount,
  adjustmentTargetAmount,
  adjustmentMaxAmount,
  onAdjustmentReasonChange,
  onAdjustmentAssumptionsChange,
  onAdjustmentMinAmountChange,
  onAdjustmentTargetAmountChange,
  onAdjustmentMaxAmountChange,
  onToggleAdjustmentsMode,
  onApplyAdjustments,
  onApprove,
  onOpenPdf,
}: {
  quoteReview: ConversationQuoteReview;
  requestChangesMode: boolean;
  requestChangesFeedback: string;
  reviewError: string | null;
  reviewSubmitting: boolean;
  pdfOpening: boolean;
  onRequestChangesFeedbackChange: (value: string) => void;
  onToggleRequestChanges: () => void;
  adjustmentsMode: boolean;
  adjustmentReason: string;
  adjustmentAssumptions: string;
  adjustmentMinAmount: string;
  adjustmentTargetAmount: string;
  adjustmentMaxAmount: string;
  onAdjustmentReasonChange: (value: string) => void;
  onAdjustmentAssumptionsChange: (value: string) => void;
  onAdjustmentMinAmountChange: (value: string) => void;
  onAdjustmentTargetAmountChange: (value: string) => void;
  onAdjustmentMaxAmountChange: (value: string) => void;
  onToggleAdjustmentsMode: () => void;
  onApplyAdjustments: () => void;
  onApprove: () => void;
  onOpenPdf: () => void;
}) {
  const briefFields = [
    {
      label: "Cliente",
      value: quoteReview.commercialBrief.customerName,
    },
    {
      label: "Resumen",
      value: quoteReview.commercialBrief.summary || quoteReview.draftSummary,
    },
    {
      label: "Presupuesto",
      value: quoteReview.commercialBrief.budget,
    },
    {
      label: "Urgencia",
      value: quoteReview.commercialBrief.urgency,
    },
    {
      label: "Tipo de proyecto",
      value: quoteReview.commercialBrief.projectType,
    },
  ].filter((field) => Boolean(field.value));

  const actionable = isQuoteReviewActionable(quoteReview.reviewStatus);
  const pdf = quoteReview.pdf ?? {
    available: false,
    fileName: null,
    generatedAt: null,
    sizeBytes: null,
    version: quoteReview.version,
  };
  const pdfVersion = pdf.version ?? quoteReview.version;
  const pdfMetadata = [
    `Version PDF v${pdfVersion}`,
    pdf.generatedAt
      ? `Generado ${formatTimestamp(pdf.generatedAt)}`
      : pdf.available
        ? "PDF disponible"
        : "Se genera al abrirlo",
    typeof pdf.sizeBytes === "number"
      ? formatBytes(pdf.sizeBytes)
      : null,
  ].filter(Boolean);
  const pricingBreakdown =
    quoteReview.pricingBreakdown && typeof quoteReview.pricingBreakdown === "object"
      ? quoteReview.pricingBreakdown
      : null;
  const breakdownItems = [
    {
      label: "Base",
      value:
        typeof pricingBreakdown?.baseAmount === "number"
          ? formatCurrency(pricingBreakdown.baseAmount)
          : "N/D",
    },
    {
      label: "Complejidad",
      value:
        typeof pricingBreakdown?.complexityAmount === "number"
          ? formatCurrency(pricingBreakdown.complexityAmount)
          : "N/D",
    },
    {
      label: "Integraciones",
      value:
        typeof pricingBreakdown?.integrationsAmount === "number"
          ? formatCurrency(pricingBreakdown.integrationsAmount)
          : "N/D",
    },
    {
      label: "Urgencia",
      value:
        typeof pricingBreakdown?.urgencyAmount === "number"
          ? formatCurrency(pricingBreakdown.urgencyAmount)
          : "N/D",
    },
    {
      label: "Riesgo",
      value:
        typeof pricingBreakdown?.riskAmount === "number"
          ? formatCurrency(pricingBreakdown.riskAmount)
          : "N/D",
    },
    {
      label: "Ajuste total",
      value:
        typeof pricingBreakdown?.totalAdjustmentAmount === "number"
          ? formatCurrency(pricingBreakdown.totalAdjustmentAmount)
          : "N/D",
    },
  ];
  const latestOwnerAdjustment =
    quoteReview.ownerAdjustments.length > 0
      ? quoteReview.ownerAdjustments[quoteReview.ownerAdjustments.length - 1]
      : null;

  return (
    <div className="border-b border-border px-6 py-5">
      <section className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className={`border text-xs font-medium ${getReviewStatusTone(quoteReview.reviewStatus)}`}
              >
                {getReviewStatusLabel(quoteReview.reviewStatus)}
              </Badge>
              <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Draft v{quoteReview.version}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Revision comercial lista dentro del CRM
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Revisa el contexto y el borrador final antes de aprobar el envio al
                cliente o pedir ajustes.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onOpenPdf}
              disabled={pdfOpening || reviewSubmitting}
              className="min-h-11"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {pdfOpening ? "Abriendo PDF..." : "Abrir PDF"}
            </Button>
            <Button
              type="button"
              onClick={onApprove}
              disabled={!actionable || reviewSubmitting}
              className="min-h-11"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Aprobar y enviar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onToggleAdjustmentsMode}
              disabled={!actionable || reviewSubmitting}
              className="min-h-11"
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              {adjustmentsMode ? "Cerrar ajustes" : "Ajustar rango"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onToggleRequestChanges}
              disabled={!actionable || reviewSubmitting}
              className="min-h-11"
            >
              <PencilLine className="mr-2 h-4 w-4" />
              Solicitar revisión
            </Button>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-border/80 bg-background/70 px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  Documento comercial PDF
                </p>
                <Badge
                  variant="secondary"
                  className={
                    pdf.available
                      ? "tone-success border"
                      : "border-border bg-muted text-muted-foreground"
                  }
                >
                  {pdf.available ? "Disponible" : "Generación al abrir"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {pdf.fileName ??
                  `cotizacion-${quoteReview.conversationId}-v${pdfVersion}.pdf`}
              </p>
              <p className="text-xs text-muted-foreground">
                {pdfMetadata.join(" • ")}
              </p>
            </div>
            <p className="max-w-sm text-xs leading-5 text-muted-foreground sm:text-right">
              Abre exactamente el documento comercial asociado al draft actual para
              validarlo antes de aprobar o pedir cambios.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border/80 bg-background/70 p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Complejidad
            </p>
            <p className="mt-1 text-sm text-foreground">
              {quoteReview.complexityScore ?? "N/D"}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-background/70 p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Confianza
            </p>
            <p className="mt-1 text-sm text-foreground">
              {quoteReview.confidence !== null ? `${quoteReview.confidence}%` : "N/D"}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-background/70 p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Regla pricing
            </p>
            <p className="mt-1 text-sm text-foreground">
              {quoteReview.pricingRule?.category ?? "general"}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-background/70 p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Version regla
            </p>
            <p className="mt-1 text-sm text-foreground">
              {quoteReview.ruleVersionUsed ?? "N/D"}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-border/80 bg-background/70 p-4">
          <p className="text-sm font-medium text-foreground">Rango comercial actual</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Min</p>
              <p className="mt-1 text-sm text-foreground">
                {formatCurrency(quoteReview.estimatedMinAmount)}
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                Target
              </p>
              <p className="mt-1 text-sm text-foreground">
                {formatCurrency(quoteReview.estimatedTargetAmount)}
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Max</p>
              <p className="mt-1 text-sm text-foreground">
                {formatCurrency(quoteReview.estimatedMaxAmount)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-border/80 bg-background/70 p-4">
          <p className="text-sm font-medium text-foreground">Pricing breakdown</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {breakdownItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="text-sm text-foreground">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {latestOwnerAdjustment ? (
          <div className="tone-info mt-5 rounded-xl border px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em]">
              Ultimo ajuste manual
            </p>
            <p className="mt-2 text-sm text-foreground">
              {latestOwnerAdjustment.adjustedBy} •{" "}
              {formatTimestamp(latestOwnerAdjustment.adjustedAt)}
            </p>
            <p className="mt-1 text-sm text-foreground">
              Rango: {formatCurrency(latestOwnerAdjustment.previousRange.min)} /{" "}
              {formatCurrency(latestOwnerAdjustment.previousRange.target)} /{" "}
              {formatCurrency(latestOwnerAdjustment.previousRange.max)} →{" "}
              {formatCurrency(latestOwnerAdjustment.adjustedRange.min)} /{" "}
              {formatCurrency(latestOwnerAdjustment.adjustedRange.target)} /{" "}
              {formatCurrency(latestOwnerAdjustment.adjustedRange.max)}
            </p>
          </div>
        ) : null}

        {adjustmentsMode ? (
          <div className="mt-5 space-y-3 rounded-xl border border-border/80 bg-background/70 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Ajustes manuales del owner</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Define rango comercial y supuestos antes de aprobar.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm text-foreground">
                <span>Min</span>
                <input
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
                  value={adjustmentMinAmount}
                  onChange={(event) => onAdjustmentMinAmountChange(event.target.value)}
                  disabled={reviewSubmitting}
                />
              </label>
              <label className="space-y-1 text-sm text-foreground">
                <span>Target</span>
                <input
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
                  value={adjustmentTargetAmount}
                  onChange={(event) => onAdjustmentTargetAmountChange(event.target.value)}
                  disabled={reviewSubmitting}
                />
              </label>
              <label className="space-y-1 text-sm text-foreground">
                <span>Max</span>
                <input
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
                  value={adjustmentMaxAmount}
                  onChange={(event) => onAdjustmentMaxAmountChange(event.target.value)}
                  disabled={reviewSubmitting}
                />
              </label>
            </div>
            <textarea
              className="min-h-24 w-full resize-y rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Supuestos (uno por línea)"
              value={adjustmentAssumptions}
              onChange={(event) => onAdjustmentAssumptionsChange(event.target.value)}
              disabled={reviewSubmitting}
            />
            <textarea
              className="min-h-20 w-full resize-y rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Razón comercial del ajuste (opcional)"
              value={adjustmentReason}
              onChange={(event) => onAdjustmentReasonChange(event.target.value)}
              disabled={reviewSubmitting}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onApplyAdjustments}
                disabled={reviewSubmitting}
              >
                Guardar ajustes
              </Button>
            </div>
          </div>
        ) : null}

        {briefFields.length > 0 ? (
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {briefFields.map((field) => (
              <div
                key={field.label}
                className="rounded-xl border border-border/80 bg-background/70 p-3"
              >
                <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {field.label}
                </dt>
                <dd className="mt-1 text-sm text-foreground">{field.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-5 rounded-xl border border-border/80 bg-background/70">
          <div className="flex items-center gap-2 border-b border-border/80 px-4 py-3">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Preview del quote</p>
          </div>
          <div className="max-h-64 overflow-y-auto px-4 py-4">
            <pre className="whitespace-pre-wrap text-sm leading-6 text-foreground">
              {quoteReview.renderedQuote ||
                quoteReview.draftSummary ||
                "No hay preview disponible para este draft todavia."}
            </pre>
          </div>
        </div>

        {quoteReview.ownerFeedbackSummary ? (
          <div className="tone-info mt-5 rounded-xl border px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em]">
              Ultima retroalimentacion del socio
            </p>
            <p className="mt-2 text-sm text-foreground">
              {quoteReview.ownerFeedbackSummary}
            </p>
          </div>
        ) : null}

        {quoteReview.deliveredToCustomerAt ? (
          <div className="tone-success mt-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Entregada automaticamente al cliente el{" "}
              {formatTimestamp(quoteReview.deliveredToCustomerAt)}.
            </p>
          </div>
        ) : quoteReview.approvedAt ? (
          <div className="tone-success mt-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Aprobada el {formatTimestamp(quoteReview.approvedAt)}.</p>
          </div>
        ) : null}

        {requestChangesMode ? (
          <div className="mt-5 space-y-3 rounded-xl border border-border/80 bg-background/70 p-4">
            <div>
              <label
                htmlFor="quote-review-feedback"
                className="text-sm font-medium text-foreground"
              >
                Comentarios para la nueva revision
              </label>
              <p className="mt-1 text-sm text-muted-foreground">
                Explica los cambios que necesita el siguiente borrador.
              </p>
            </div>
            <textarea
              id="quote-review-feedback"
              className="min-h-28 w-full resize-y rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ejemplo: ajusta alcance, cronograma y supuestos comerciales."
              value={requestChangesFeedback}
              onChange={(event) =>
                onRequestChangesFeedbackChange(event.target.value)
              }
              disabled={reviewSubmitting}
            />
          </div>
        ) : null}

        {reviewError ? (
          <p className="mt-4 text-sm text-destructive">{reviewError}</p>
        ) : null}
      </section>
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
      <div className="flex justify-start">
        <Skeleton className="h-20 w-full max-w-md rounded-2xl" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-16 w-full max-w-sm rounded-2xl" />
      </div>
    </div>
  );
}

function DetailStateCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <div className="max-w-md rounded-2xl border border-border/70 bg-card/70 px-6 py-7 text-center">
        <MessageSquare className="mx-auto h-11 w-11 text-muted-foreground/50" />
        <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function DetailPanel() {
  const searchParams = useSearchParams();
  const { conversations, mutate: mutateConversations } = useConversations();
  const selectedId = searchParams.get("conversation");
  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedId) ??
    null;
  const { messages, error, state, mutate } = useConversationMessages(selectedId);
  const {
    quoteReview,
    error: quoteReviewError,
    state: quoteReviewState,
    mutate: mutateQuoteReview,
  } = useConversationQuoteReview(selectedId);
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [requestChangesMode, setRequestChangesMode] = useState(false);
  const [requestChangesFeedback, setRequestChangesFeedback] = useState("");
  const [adjustmentsMode, setAdjustmentsMode] = useState(false);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentAssumptions, setAdjustmentAssumptions] = useState("");
  const [adjustmentMinAmount, setAdjustmentMinAmount] = useState("");
  const [adjustmentTargetAmount, setAdjustmentTargetAmount] = useState("");
  const [adjustmentMaxAmount, setAdjustmentMaxAmount] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [pdfOpening, setPdfOpening] = useState(false);
  const [controlSubmitting, setControlSubmitting] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const [controlNotice, setControlNotice] = useState<string | null>(null);
  const quoteTotal =
    (quoteReview?.estimatedTargetAmount ?? 0) > 0
      ? quoteReview?.estimatedTargetAmount ?? null
      : quoteReview?.estimatedMaxAmount ?? quoteReview?.estimatedMinAmount ?? null;

  useEffect(() => {
    setRequestChangesMode(false);
    setRequestChangesFeedback("");
    setAdjustmentsMode(false);
    setAdjustmentReason("");
    setAdjustmentAssumptions("");
    setAdjustmentMinAmount("");
    setAdjustmentTargetAmount("");
    setAdjustmentMaxAmount("");
    setReviewError(null);
    setControlError(null);
    setControlNotice(null);
  }, [selectedId]);

  useEffect(() => {
    if (!quoteReview) {
      return;
    }

    setAdjustmentMinAmount(
      quoteReview.estimatedMinAmount !== null ? String(quoteReview.estimatedMinAmount) : "",
    );
    setAdjustmentTargetAmount(
      quoteReview.estimatedTargetAmount !== null
        ? String(quoteReview.estimatedTargetAmount)
        : "",
    );
    setAdjustmentMaxAmount(
      quoteReview.estimatedMaxAmount !== null ? String(quoteReview.estimatedMaxAmount) : "",
    );
    const latest = quoteReview.ownerAdjustments[quoteReview.ownerAdjustments.length - 1];
    setAdjustmentAssumptions(latest?.assumptions?.join("\n") ?? "");
    setAdjustmentReason(latest?.reason ?? "");
  }, [quoteReview]);

  async function handleSend() {
    if (!messageBody.trim() || !selectedId || sending) return;

    setSending(true);
    setSendError(null);

    try {
      const sent = await apiFetchJson<ConversationMessageDto>(
        `/conversations/${encodeURIComponent(selectedId)}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ body: messageBody.trim() }),
        },
      );

      await mutate((current) => [...(current ?? []), sent], { revalidate: false });
      setMessageBody("");
    } catch (sendAttemptError) {
      if (isApiError(sendAttemptError)) {
        setSendError(sendAttemptError.message);
      } else {
        setSendError("No se pudo enviar el mensaje. Intenta nuevamente.");
      }
    } finally {
      setSending(false);
    }
  }

  async function handleApproveQuote() {
    if (!selectedId || !quoteReview || reviewSubmitting) {
      return;
    }

    setReviewSubmitting(true);
    setReviewError(null);

    try {
      const updatedReview = await apiFetchJson<ConversationQuoteReviewDto>(
        `/conversations/${encodeURIComponent(selectedId)}/quote-review/approve`,
        {
          method: "POST",
          body: JSON.stringify({ version: quoteReview.version }),
        },
      );

      await mutateQuoteReview(updatedReview, { revalidate: false });
      await mutateConversations();
      setRequestChangesMode(false);
      setRequestChangesFeedback("");
    } catch (reviewAttemptError) {
      if (isApiError(reviewAttemptError)) {
        setReviewError(reviewAttemptError.message);
      } else {
        setReviewError("No se pudo aprobar el quote. Intenta nuevamente.");
      }
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function handleOpenPdf() {
    if (!selectedId || !quoteReview || pdfOpening) {
      return;
    }

    const pdf = quoteReview.pdf ?? {
      available: false,
      fileName: null,
      generatedAt: null,
      sizeBytes: null,
      version: quoteReview.version,
    };

    const pdfUrl = `/conversations/${encodeURIComponent(selectedId)}/quote-review/pdf`;

    setPdfOpening(true);
    setReviewError(null);

    try {
      const response = await apiFetch(pdfUrl, {
        method: "GET",
        headers: {
          Accept: "application/pdf",
        },
      });

      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(`PDF request failed with status ${response.status}`);
      }

      const pdfBlob = await response.blob();
      const blobUrl = window.URL.createObjectURL(pdfBlob);
      const openedWindow = window.open(blobUrl, "_blank", "noopener,noreferrer");

      if (!openedWindow) {
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download =
          pdf.fileName ?? `cotizacion-${selectedId}-v${pdf.version}.pdf`;
        anchor.rel = "noopener noreferrer";
        anchor.click();
      }

      window.setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 60_000);
    } catch {
      setReviewError("No se pudo abrir el PDF comercial. Intenta nuevamente.");
    } finally {
      setPdfOpening(false);
    }
  }

  async function handleRequestChanges() {
    if (!selectedId || !quoteReview || reviewSubmitting) {
      return;
    }

    if (!requestChangesMode) {
      setReviewError(null);
      setRequestChangesMode(true);
      return;
    }

    if (!requestChangesFeedback.trim()) {
      setReviewError("Agrega comentarios antes de solicitar una nueva revision.");
      return;
    }

    setReviewSubmitting(true);
    setReviewError(null);

    try {
      const updatedReview = await apiFetchJson<ConversationQuoteReviewDto>(
        `/conversations/${encodeURIComponent(selectedId)}/quote-review/request-changes`,
        {
          method: "POST",
          body: JSON.stringify({
            version: quoteReview.version,
            feedback: requestChangesFeedback.trim(),
          }),
        },
      );

      await mutateQuoteReview(updatedReview, { revalidate: false });
      await mutateConversations();
      setRequestChangesMode(false);
      setRequestChangesFeedback("");
    } catch (reviewAttemptError) {
      if (isApiError(reviewAttemptError)) {
        setReviewError(reviewAttemptError.message);
      } else {
        setReviewError(
          "No se pudo registrar la solicitud de cambios. Intenta nuevamente.",
        );
      }
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function handleApplyOwnerAdjustments() {
    if (!selectedId || !quoteReview || reviewSubmitting) {
      return;
    }

    const assumptions = adjustmentAssumptions
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);

    setReviewSubmitting(true);
    setReviewError(null);

    try {
      const updatedReview = await apiFetchJson<ConversationQuoteReviewDto>(
        `/conversations/${encodeURIComponent(selectedId)}/quote-review/owner-adjustments`,
        {
          method: "POST",
          body: JSON.stringify({
            version: quoteReview.version,
            estimatedMinAmount: parseNumericInput(adjustmentMinAmount),
            estimatedTargetAmount: parseNumericInput(adjustmentTargetAmount),
            estimatedMaxAmount: parseNumericInput(adjustmentMaxAmount),
            assumptions,
            reason: adjustmentReason.trim() || undefined,
          }),
        },
      );

      await mutateQuoteReview(updatedReview, { revalidate: false });
      await mutateConversations();
      setAdjustmentsMode(false);
    } catch (reviewAttemptError) {
      if (isApiError(reviewAttemptError)) {
        setReviewError(reviewAttemptError.message);
      } else {
        setReviewError("No se pudieron guardar los ajustes manuales.");
      }
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function handleTransferControl(nextControl: "human" | "ai-resume") {
    if (!selectedId || controlSubmitting) {
      return;
    }

    setControlSubmitting(true);
    setControlError(null);
    setControlNotice(null);

    try {
      const response = await apiFetchJson<{
        conversationId: string;
        state: ConversationControlState;
        control: ConversationControlMode;
        updatedAt: string;
        updatedBy: string;
      }>(`/conversations/${encodeURIComponent(selectedId)}/control/${nextControl}`, {
        method: "POST",
      });

      await mutateConversations(
        (current) =>
          (current ?? []).map((conversation) =>
            conversation.id === response.conversationId
              ? {
                  ...conversation,
                  conversationControl: {
                    state: response.state,
                    control: response.control,
                    updatedAt: response.updatedAt,
                    updatedBy: response.updatedBy,
                  },
                }
              : conversation,
          ),
        { revalidate: false },
      );
      await mutateConversations();
      setControlNotice(
        nextControl === "human"
          ? "Control transferido a humano."
          : "Conversacion lista para que IA retome en el siguiente inbound.",
      );
    } catch (controlAttemptError) {
      if (isApiError(controlAttemptError)) {
        setControlError(controlAttemptError.message);
      } else {
        setControlError("No se pudo actualizar el control de la conversacion.");
      }
    } finally {
      setControlSubmitting(false);
    }
  }

  if (!selectedConversation) {
    return (
      <DetailStateCard
        title="Selecciona una conversacion"
        description="El detalle de mensajes y cotizaciones aparecera aqui."
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-muted/20">
      <div className="sticky top-0 z-10 border-b border-border/70 bg-background/85 px-8 py-4 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold tracking-tight text-foreground">
              {selectedConversation.contactName}
            </h2>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              Conversation updated{" "}
              {formatTimestamp(selectedConversation.lastMessageAt)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className={getControlTone(selectedConversation.conversationControl.control)}
              >
                {getControlLabel(selectedConversation.conversationControl.control)}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {getControlStateLabel(selectedConversation.conversationControl.state)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                void handleTransferControl("human");
              }}
              disabled={
                controlSubmitting ||
                selectedConversation.conversationControl.control === "human_control"
              }
            >
              <Phone className="mr-2 h-4 w-4" />
              {controlSubmitting &&
              selectedConversation.conversationControl.control !== "human_control"
                ? "Transfiriendo..."
                : "Pasar a humano"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                void handleTransferControl("ai-resume");
              }}
              disabled={
                controlSubmitting ||
                selectedConversation.conversationControl.control === "pending_resume"
              }
            >
              <Send className="mr-2 h-4 w-4" />
              {controlSubmitting &&
              selectedConversation.conversationControl.control !== "pending_resume"
                ? "Actualizando..."
                : "Devolver a IA"}
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9">
              <MoreVertical className="h-4 w-4" />
            </Button>
            {selectedConversation.unreadCount > 0 ? (
              <Badge>{selectedConversation.unreadCount} unread</Badge>
            ) : null}
          </div>
        </div>
      </div>

      {controlNotice ? (
        <div className="border-b border-border px-8 py-3">
          <div className="tone-success rounded-xl border px-3 py-2 text-sm">
            {controlNotice}
          </div>
        </div>
      ) : null}

      {controlError ? (
        <div className="border-b border-border px-8 py-3">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {controlError}
          </div>
        </div>
      ) : null}

      {quoteReviewState === "loading" && selectedConversation.pendingQuote ? (
        <QuoteReviewSkeleton />
      ) : quoteReview ? (
        <QuoteReviewCard
          quoteReview={quoteReview}
          requestChangesMode={requestChangesMode}
          requestChangesFeedback={requestChangesFeedback}
          reviewError={reviewError}
          reviewSubmitting={reviewSubmitting}
          pdfOpening={pdfOpening}
          onRequestChangesFeedbackChange={(value) => {
            setRequestChangesFeedback(value);
            if (reviewError) {
              setReviewError(null);
            }
          }}
          onToggleRequestChanges={() => {
            void handleRequestChanges();
          }}
          adjustmentsMode={adjustmentsMode}
          adjustmentReason={adjustmentReason}
          adjustmentAssumptions={adjustmentAssumptions}
          adjustmentMinAmount={adjustmentMinAmount}
          adjustmentTargetAmount={adjustmentTargetAmount}
          adjustmentMaxAmount={adjustmentMaxAmount}
          onAdjustmentReasonChange={setAdjustmentReason}
          onAdjustmentAssumptionsChange={setAdjustmentAssumptions}
          onAdjustmentMinAmountChange={setAdjustmentMinAmount}
          onAdjustmentTargetAmountChange={setAdjustmentTargetAmount}
          onAdjustmentMaxAmountChange={setAdjustmentMaxAmount}
          onToggleAdjustmentsMode={() => {
            setAdjustmentsMode((current) => !current);
          }}
          onApplyAdjustments={() => {
            void handleApplyOwnerAdjustments();
          }}
          onApprove={() => {
            void handleApproveQuote();
          }}
          onOpenPdf={() => {
            void handleOpenPdf();
          }}
        />
      ) : quoteReviewState === "error" ? (
        <div className="border-b border-border px-6 py-4">
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              No se pudo cargar la revision comercial
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isApiError(quoteReviewError)
                ? `El backend respondio con estado ${quoteReviewError.status}.`
                : "Intenta recargar la conversacion."}
            </p>
          </div>
        </div>
      ) : null}

      {state === "loading" ? (
        <div className="flex-1 px-6 py-6">
          <MessageSkeleton />
        </div>
      ) : state === "unauthorized" ? (
        <DetailStateCard
          title="Tu sesion expiro"
          description="Redirigiendo al acceso del CRM."
        />
      ) : state === "error" ? (
        <DetailStateCard
          title="No se pudo cargar el historial"
          description={
            isApiError(error)
              ? `El backend respondio con estado ${error.status}.`
              : "Intenta recargar la pagina."
          }
        />
      ) : state === "empty" ? (
        <DetailStateCard
          title="Sin mensajes en esta conversacion"
          description="Cuando exista historial, aparecera aqui en orden cronologico."
        />
      ) : (
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
          <div className="flex justify-center">
            <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Today
            </span>
          </div>
          {messages.map((message) => {
            const isOutbound = message.direction === "outbound";

            return (
              <div
                key={message.id}
                className={
                  isOutbound
                    ? "flex justify-end"
                    : "flex items-start gap-3 justify-start"
                }
              >
                {!isOutbound ? (
                  <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-[11px] font-semibold text-foreground">
                    {getInitials(selectedConversation.contactName)}
                  </span>
                ) : null}
                <div
                  className={
                    isOutbound
                      ? "max-w-xl rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground shadow-sm"
                      : "max-w-xl rounded-2xl rounded-bl-md border border-border/70 bg-card px-4 py-3 text-sm text-foreground shadow-sm"
                  }
                >
                  <p>{message.body?.trim() || "Sin contenido de texto."}</p>
                  <p
                    className={
                      isOutbound
                        ? "mt-2 text-xs text-primary-foreground/80"
                        : "mt-2 text-xs text-muted-foreground"
                    }
                  >
                    {formatTimeOnly(message.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
          {quoteReview ? (
            <div className="flex justify-end">
              <div className="w-full max-w-xl space-y-3">
                <div className="rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-sm text-primary-foreground">
                  AI prepared a commercial quote draft based on the current thread.
                </div>
                <div className="overflow-hidden rounded-xl border border-primary/30 bg-card shadow-sm">
                  <div className="flex items-center justify-between border-b border-primary/20 bg-primary/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-primary">
                      <FileText className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-[0.12em]">
                        AI Generated Quote
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-primary">
                      v{quoteReview.version}
                    </span>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Min estimate</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(quoteReview.estimatedMinAmount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Target estimate</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(quoteReview.estimatedTargetAmount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <span className="text-sm font-semibold text-foreground">
                        Total estimate
                      </span>
                      <span className="text-base font-semibold text-primary">
                        {formatCurrency(quoteTotal)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 text-[11px] uppercase tracking-[0.08em]"
                        onClick={() => {
                          setAdjustmentsMode(true);
                        }}
                      >
                        Review & Edit
                      </Button>
                      <Button
                        type="button"
                        className="h-8 text-[11px] uppercase tracking-[0.08em]"
                        onClick={() => {
                          void handleApproveQuote();
                        }}
                        disabled={reviewSubmitting}
                      >
                        Approve & Send
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="text-right text-[10px] text-muted-foreground">
                  {formatTimeOnly(selectedConversation.lastMessageAt)} • AI Representative
                </p>
              </div>
            </div>
          ) : null}
          {quoteReview ? (
            <div className="flex justify-center">
              <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">
                  High lead heat: contact is reviewing the quote now.
                </span>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {state !== "unauthorized" ? (
        <div className="border-t border-border bg-card/50 px-6 py-4">
          <div className="relative flex items-end gap-3">
            <div className="absolute left-3 top-3 flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
                <SmilePlus className="h-4 w-4" />
              </Button>
            </div>
            <textarea
              className="flex-1 resize-none rounded-2xl border border-border bg-background px-24 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Type a message or use '/' for AI commands..."
              rows={2}
              value={messageBody}
              onChange={(event) => {
                setMessageBody(event.target.value);
                if (sendError) {
                  setSendError(null);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              disabled={sending}
            />
            <Button
              size="icon"
              disabled={!messageBody.trim() || sending}
              onClick={() => void handleSend()}
              className="h-10 w-10 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {sendError ? (
            <p className="mt-2 text-sm text-destructive">{sendError}</p>
          ) : null}
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            AI is monitoring this thread. Mention{" "}
            <span className="font-semibold text-primary">@agent</span> to trigger actions.
          </p>
        </div>
      ) : null}
    </div>
  );
}
