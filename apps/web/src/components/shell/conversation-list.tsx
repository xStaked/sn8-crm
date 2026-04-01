"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversations } from "@/hooks/use-conversations";
import { isApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/conversation";

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
        "flex w-full items-center gap-3 border-l-2 border-transparent px-4 py-3 text-left transition-colors",
        "hover:bg-zinc-800/50",
        isSelected && "border-primary bg-zinc-800",
      )}
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="bg-zinc-700 text-xs text-zinc-100">
          {getInitials(conversation.contactName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {conversation.contactName}
            </span>
            {conversation.pendingQuote ? (
              <Badge
                variant="secondary"
                className="shrink-0 border border-amber-500/30 bg-amber-500/10 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-200"
              >
                Quote pendiente
              </Badge>
            ) : null}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeTime(conversation.lastMessageAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">
              {conversation.lastMessage}
            </p>
            {conversation.pendingQuote ? (
              <p className="mt-1 text-[11px] font-medium text-amber-200">
                Revision pendiente v{conversation.pendingQuote.version}
              </p>
            ) : null}
          </div>
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
    </button>
  );
}

function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function ConversationList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { conversations, error, state } = useConversations();
  const selectedId =
    searchParams.get("conversation") ?? conversations[0]?.id ?? null;

  function handleSelect(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("conversation", id);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-background">
      <div className="flex h-14 items-center border-b border-border px-4">
        <h1 className="text-lg font-semibold text-foreground">Inbox</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {state === "loading" ? (
          <>
            <ConversationSkeleton />
            <ConversationSkeleton />
            <ConversationSkeleton />
          </>
        ) : state === "unauthorized" ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">
              Tu sesion expiro
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Redirigiendo al acceso del CRM.
            </p>
          </div>
        ) : state === "error" ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">
              No se pudo cargar el inbox
            </p>
            <p className="text-sm text-muted-foreground">
              {isApiError(error)
                ? `El backend respondio con estado ${error.status}.`
                : "Intenta recargar la pagina."}
            </p>
          </div>
        ) : state === "empty" ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">
              Sin conversaciones activas
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Los mensajes de WhatsApp apareceran aqui cuando lleguen.
            </p>
          </div>
        ) : (
          conversations.map((conversation) => (
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
