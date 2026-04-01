"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { apiFetchJson, isApiError } from "@/lib/api";
import type {
  ConversationQuoteReview,
  ConversationQuoteReviewDto,
  ConversationQuoteReviewState,
} from "@/types/conversation";

const REFRESH_INTERVAL_MS = 5000;

const buildQuoteReviewEndpoint = (conversationId: string) =>
  `/conversations/${encodeURIComponent(conversationId)}/quote-review`;

const fetcher = (path: string) => apiFetchJson<ConversationQuoteReviewDto>(path);

export function useConversationQuoteReview(conversationId: string | null) {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<ConversationQuoteReviewDto>(
    conversationId ? buildQuoteReviewEndpoint(conversationId) : null,
    fetcher,
    {
      refreshInterval: REFRESH_INTERVAL_MS,
      onErrorRetry: (_error, _key, _config, revalidate, context) => {
        if (
          isApiError(_error) &&
          (_error.status === 401 || _error.status === 404)
        ) {
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

  const quoteReview: ConversationQuoteReview | null = data ?? null;
  const state: ConversationQuoteReviewState =
    !conversationId
      ? "idle"
      : isLoading
        ? "loading"
        : isApiError(error) && error.status === 401
          ? "unauthorized"
          : isApiError(error) && error.status === 404
            ? "empty"
            : error
              ? "error"
              : quoteReview
                ? "ready"
                : "empty";

  return {
    quoteReview,
    error,
    isLoading,
    state,
    mutate,
  };
}
