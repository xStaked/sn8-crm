"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ClipboardCheck, MessageSquare, PencilLine, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversationMessages } from "@/hooks/use-conversation-messages";
import { useConversationQuoteReview } from "@/hooks/use-conversation-quote-review";
import { useConversations } from "@/hooks/use-conversations";
import { apiFetchJson, isApiError } from "@/lib/api";
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
  onRequestChangesFeedbackChange,
  onToggleRequestChanges,
  onApprove,
}: {
  quoteReview: ConversationQuoteReview;
  requestChangesMode: boolean;
  requestChangesFeedback: string;
  reviewError: string | null;
  reviewSubmitting: boolean;
  onRequestChangesFeedbackChange: (value: string) => void;
  onToggleRequestChanges: () => void;
  onApprove: () => void;
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
              onClick={onToggleRequestChanges}
              disabled={!actionable || reviewSubmitting}
              className="min-h-11"
            >
              <PencilLine className="mr-2 h-4 w-4" />
              Solicitar revisión
            </Button>
          </div>
        </div>

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
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    setRequestChangesMode(false);
    setRequestChangesFeedback("");
    setReviewError(null);
  }, [selectedId]);

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
          onRequestChangesFeedbackChange={(value) => {
            setRequestChangesFeedback(value);
            if (reviewError) {
              setReviewError(null);
            }
          }}
          onToggleRequestChanges={() => {
            void handleRequestChanges();
          }}
          onApprove={() => {
            void handleApproveQuote();
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
