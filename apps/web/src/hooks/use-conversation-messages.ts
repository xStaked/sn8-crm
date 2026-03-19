"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { apiFetchJson, isApiError } from "@/lib/api";
import type {
  ConversationMessage,
  ConversationMessageDto,
  ConversationMessageState,
} from "@/types/conversation";

const buildMessagesEndpoint = (conversationId: string) =>
  `/conversations/${encodeURIComponent(conversationId)}/messages`;
const REFRESH_INTERVAL_MS = 5000;

const fetcher = (path: string) => apiFetchJson<ConversationMessageDto[]>(path);

export function useConversationMessages(conversationId: string | null) {
  const router = useRouter();
  const { data, error, isLoading } = useSWR<ConversationMessageDto[]>(
    conversationId ? buildMessagesEndpoint(conversationId) : null,
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

  const messages: ConversationMessage[] = data ?? [];
  const state: ConversationMessageState =
    !conversationId
      ? "idle"
      : isLoading
        ? "loading"
        : isApiError(error) && error.status === 401
          ? "unauthorized"
          : error
            ? "error"
            : messages.length === 0
              ? "empty"
              : "ready";

  return {
    messages,
    error,
    isLoading,
    state,
  };
}
