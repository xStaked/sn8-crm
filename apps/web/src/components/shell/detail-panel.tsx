"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  MessageSquare,
  PencilLine,
  Send,
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
  ConversationMessageDto,
  ConversationQuoteReview,
  ConversationQuoteReviewDto,
} from "@/types/conversation";

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
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "changes_requested":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
    case "approved":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "delivered_to_customer":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function isQuoteReviewActionable(status: ConversationQuoteReview["reviewStatus"]) {
  return status === "pending_owner_review" || status === "ready_for_recheck";
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
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
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
          <div className="mt-5 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-sky-200">
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
          <div className="mt-5 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-sky-200">
              Ultima retroalimentacion del socio
            </p>
            <p className="mt-2 text-sm text-foreground">
              {quoteReview.ownerFeedbackSummary}
            </p>
          </div>
        ) : null}

        {quoteReview.deliveredToCustomerAt ? (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-100">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Entregada automaticamente al cliente el{" "}
              {formatTimestamp(quoteReview.deliveredToCustomerAt)}.
            </p>
          </div>
        ) : quoteReview.approvedAt ? (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-100">
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
    <div className="space-y-3">
      <Skeleton className="h-4 w-32" />
      <div className="flex justify-start">
        <Skeleton className="h-20 w-full max-w-md rounded-2xl" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-16 w-full max-w-sm rounded-2xl" />
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

  if (!selectedConversation) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">
            Selecciona una conversacion para ver el detalle.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {selectedConversation.contactName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ultimo movimiento: {formatTimestamp(selectedConversation.lastMessageAt)}
            </p>
          </div>
          {selectedConversation.unreadCount > 0 ? (
            <Badge>{selectedConversation.unreadCount} sin leer</Badge>
          ) : null}
        </div>
      </div>

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
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="max-w-md text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-sm font-medium text-foreground">
              Tu sesion expiro
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Redirigiendo al acceso del CRM.
            </p>
          </div>
        </div>
      ) : state === "error" ? (
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="max-w-md text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-sm font-medium text-foreground">
              No se pudo cargar el historial
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {isApiError(error)
                ? `El backend respondio con estado ${error.status}.`
                : "Intenta recargar la pagina."}
            </p>
          </div>
        </div>
      ) : state === "empty" ? (
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="max-w-md text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-sm font-medium text-foreground">
              Sin mensajes en esta conversacion
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Cuando exista historial, aparecera aqui en orden cronologico.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
          {messages.map((message) => {
            const isOutbound = message.direction === "outbound";

            return (
              <div
                key={message.id}
                className={isOutbound ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    isOutbound
                      ? "max-w-xl rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground"
                      : "max-w-xl rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-sm text-foreground"
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
                    {formatTimestamp(message.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {state !== "unauthorized" ? (
        <div className="border-t border-border px-6 py-4">
          <div className="flex items-end gap-3">
            <textarea
              className="flex-1 resize-none rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Escribe un mensaje..."
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
        </div>
      ) : null}
    </div>
  );
}
