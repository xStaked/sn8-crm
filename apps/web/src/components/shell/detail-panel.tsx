"use client";

import { useSearchParams } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversationMessages } from "@/hooks/use-conversation-messages";
import { useConversations } from "@/hooks/use-conversations";
import { isApiError } from "@/lib/api";

function formatTimestamp(isoString: string) {
  return new Date(isoString).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
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
  const { conversations } = useConversations();
  const selectedId = searchParams.get("conversation");
  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedId) ??
    null;
  const { messages, error, state } = useConversationMessages(selectedId);

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
    </div>
  );
}
