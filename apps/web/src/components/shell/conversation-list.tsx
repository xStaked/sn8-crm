"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversations } from "@/hooks/use-conversations";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Conversation, ConversationControlMode } from "@/types/conversation";

type ConversationFilter = "all" | "unread" | "ai_managed";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;

  return new Date(isoString).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

function getControlChip(control: ConversationControlMode): {
  label: string;
  className: string;
} {
  switch (control) {
    case "human_control":
      return {
        label: "Human takeover",
        className: "text-tone-warning",
      };
    case "pending_resume":
      return {
        label: "Ready to resume AI",
        className: "text-tone-info",
      };
    case "ai_control":
    default:
      return {
        label: "AI managed",
        className: "text-primary",
      };
  }
}

function ConversationRow({
  conversation,
  isSelected,
  onSelect,
}: {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={cn(
        "w-full rounded-xl px-4 py-3 text-left transition-all",
        isSelected
          ? "border-l-4 border-primary bg-card shadow-sm"
          : "hover:bg-accent/35",
      )}
    >
      <div className="mb-1 flex items-start justify-between gap-3">
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-[0.14em]",
            getControlChip(conversation.conversationControl.control).className,
          )}
        >
          {getControlChip(conversation.conversationControl.control).label}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatRelativeTime(conversation.lastMessageAt)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className="bg-muted text-xs text-foreground">
            {getInitials(conversation.contactName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {conversation.contactName}
            </span>
            {conversation.pendingQuote ? (
              <Badge
                variant="secondary"
                className="tone-warning shrink-0 border text-[10px] font-medium uppercase tracking-[0.12em]"
              >
                v{conversation.pendingQuote.version}
              </Badge>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {conversation.lastMessage}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {conversation.pendingQuote ? (
                <span className="rounded-full border border-border/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {conversation.pendingQuote.reviewStatus.replaceAll("_", " ")}
                </span>
              ) : null}
              {conversation.unreadCount > 0 ? (
                <Badge className="min-w-[20px] rounded-full px-1.5 text-[10px]">
                  {conversation.unreadCount}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2 flex min-h-4 items-center gap-2 pl-12">
        {isSelected ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Active thread
            </span>
          </>
        ) : null}
      </div>
    </button>
  );
}

function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl px-4 py-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

function ConversationState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="px-4 py-8">
      <div className="mx-auto max-w-sm rounded-xl border border-border/70 bg-card/70 px-5 py-6 text-center">
        <MessageSquare className="mx-auto h-9 w-9 text-muted-foreground/55" />
        <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function ConversationList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { conversations, error, state } = useConversations();
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const filteredConversations = useMemo(() => {
    switch (filter) {
      case "unread":
        return conversations.filter((conversation) => conversation.unreadCount > 0);
      case "ai_managed":
        return conversations.filter(
          (conversation) => conversation.conversationControl.control === "ai_control",
        );
      default:
        return conversations;
    }
  }, [conversations, filter]);
  const selectedId =
    searchParams.get("conversation") ?? filteredConversations[0]?.id ?? null;

  function handleSelect(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("conversation", id);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <aside className="hidden w-96 shrink-0 flex-col border-r border-border bg-muted/25 lg:flex">
      <div className="border-b border-border/70 px-6 py-5">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Conversations
        </h1>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              filter === "all"
                ? "bg-primary text-primary-foreground"
                : "border border-border/70 bg-card text-foreground hover:bg-accent/35",
            )}
          >
            All Chats
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              filter === "unread"
                ? "bg-primary text-primary-foreground"
                : "border border-border/70 bg-card text-foreground hover:bg-accent/35",
            )}
          >
            Unread
          </button>
          <button
            type="button"
            onClick={() => setFilter("ai_managed")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              filter === "ai_managed"
                ? "bg-primary text-primary-foreground"
                : "border border-border/70 bg-card text-foreground hover:bg-accent/35",
            )}
          >
            AI Managed
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {state === "loading" ? (
          <>
            <ConversationSkeleton />
            <ConversationSkeleton />
            <ConversationSkeleton />
          </>
        ) : state === "unauthorized" ? (
          <ConversationState
            title="Tu sesion expiro"
            description="Redirigiendo al acceso del CRM."
          />
        ) : state === "error" ? (
          <ConversationState
            title="No se pudo cargar el inbox"
            description={
              isApiError(error)
                ? `El backend respondio con estado ${error.status}.`
                : "Intenta recargar la pagina."
            }
          />
        ) : state === "empty" ? (
          <ConversationState
            title="Sin conversaciones activas"
            description="Los mensajes de WhatsApp apareceran aqui cuando lleguen."
          />
        ) : filteredConversations.length === 0 ? (
          <ConversationState
            title="No hay conversaciones en este filtro"
            description="Cambia de vista para revisar otros hilos."
          />
        ) : (
          filteredConversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              isSelected={selectedId === conversation.id}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
}
