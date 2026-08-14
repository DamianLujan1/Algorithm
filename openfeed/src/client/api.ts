import type {
  AlgorithmInfo,
  AssistantResponse,
  FeedResponse,
  InteractionRequest,
  SessionUser,
  Topic,
} from "../shared/types.js";

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
    throw new ApiError(
      payload.error?.message ?? "Openfeed could not complete that request.",
      response.status,
      payload.error?.code,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  getSession: () => request<{ user: SessionUser | null }>("/api/session"),

  createSession: (displayName: string, interests: Topic[]) =>
    request<{ user: SessionUser }>("/api/session", {
      method: "POST",
      body: JSON.stringify({ displayName, interests }),
    }),

  deleteSession: () => request<void>("/api/session", { method: "DELETE" }),

  getFeed: (earlybirdMultiplier: number) =>
    request<FeedResponse>(
      `/api/feed?multiplier=${encodeURIComponent(earlybirdMultiplier.toFixed(2))}`,
    ),

  interact: (interaction: InteractionRequest) =>
    request<{ ok: true }>("/api/interactions", {
      method: "POST",
      body: JSON.stringify(interaction),
    }),

  ask: (question: string, multiplier: number) =>
    request<AssistantResponse>("/api/assistant", {
      method: "POST",
      body: JSON.stringify({ question, multiplier }),
    }),

  getAlgorithm: () => request<AlgorithmInfo>("/api/algorithm"),
};
