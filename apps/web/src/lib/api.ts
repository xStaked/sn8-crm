const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  "",
);
const ACCESS_TOKEN_STORAGE_KEY = "sn8.access_token";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function buildApiUrl(path: string): string {
  return `${API_URL}/${path.replace(/^\/+/, "")}`;
}

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function setStoredAccessToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
}

export function clearStoredAccessToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = getStoredAccessToken();
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(buildApiUrl(path), {
    ...options,
    credentials: "include",
    headers,
  });
}

export async function apiFetchJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await apiFetch(path, options);

  if (!response.ok) {
    let details: unknown;
    let message = `Request failed for ${path}`;

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      details = await response.json();

      if (
        typeof details === "object" &&
        details !== null &&
        "message" in details
      ) {
        const responseMessage = (details as { message?: unknown }).message;
        if (typeof responseMessage === "string") {
          message = responseMessage;
        } else if (
          Array.isArray(responseMessage) &&
          responseMessage.every((entry) => typeof entry === "string")
        ) {
          message = responseMessage.join(", ");
        }
      }
    } else {
      const text = await response.text();
      if (text.trim().length > 0) {
        message = text;
      }
    }

    throw new ApiError(message, response.status, details);
  }

  return (await response.json()) as T;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
