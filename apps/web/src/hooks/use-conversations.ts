"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { apiFetchJson, isApiError } from "@/lib/api";
import type {
  Conversation,
  ConversationListState,
  ConversationSummaryDto,
} from "@/types/conversation";

const DEV_FALLBACK_CONVERSATIONS: Conversation[] =
  process.env.NODE_ENV === "development"
    ? [
        {
          id: "dev-1",
          contactName: "Carlos Mendez",
          lastMessage: "Me interesa el proyecto de la pagina web...",
          lastMessageAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          unreadCount: 2,
          pendingQuote: null,
        },
        {
          id: "dev-2",
          contactName: "Ana Rodriguez",
          lastMessage: "Perfecto, quedamos para el jueves.",
          lastMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          unreadCount: 0,
          pendingQuote: null,
        },
      ]
    : [];

const CONVERSATIONS_ENDPOINT = "/conversations";
const REFRESH_INTERVAL_MS = 5000;

const fetcher = (path: string) => apiFetchJson<ConversationSummaryDto[]>(path);

export function useConversations() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<ConversationSummaryDto[]>(
    CONVERSATIONS_ENDPOINT,
    fetcher,
    {
      refreshInterval: REFRESH_INTERVAL_MS,
      onErrorRetry: (_error, _key, _config, revalidate, context) => {
        if (isApiError(_error) && _error.status === 401) {
          return;
        }

        if (context.retryCount >= 3) {
          return;
        }

        setTimeout(() => {
          void revalidate({ retryCount: context.retryCount });
        }, 5000);
      },
    },
  );

  useEffect(() => {
    if (isApiError(error) && error.status === 401) {
      router.replace("/login");
      router.refresh();
    }
  }, [error, router]);

  const conversations: Conversation[] = data ?? DEV_FALLBACK_CONVERSATIONS;
  const state: ConversationListState = isLoading
    ? "loading"
    : isApiError(error) && error.status === 401
      ? "unauthorized"
      : error
        ? "error"
        : conversations.length === 0
          ? "empty"
          : "ready";

  return {
    conversations,
    error,
    isLoading,
    state,
    mutate,
  };
}
