export interface TokenPair {
  access: string;
  refresh: string;
}

const TOKENS_KEY = "so_tokens";
const API_URL = import.meta.env.VITE_API_URL ?? "/api";

/** Mode penyimpanan data frontend (issue #3: frontend-first).
 *  - "local": seluruh CRUD via LocalStorage (default, tanpa backend/login).
 *  - "api": via Backend REST API (fase backend, butuh login/JWT).
 *  Ganti via env `VITE_DATA_MODE=api` tanpa mengubah UI/business logic. */
export const DATA_MODE: "local" | "api" =
  (import.meta.env.VITE_DATA_MODE as string) === "api" ? "api" : "local";

export function isLocalMode(): boolean {
  return DATA_MODE === "local";
}

export function getTokens(): TokenPair | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TokenPair;
    return parsed?.access && parsed?.refresh ? parsed : null;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return getTokens()?.access ?? null;
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify({ access, refresh }));
}

export function clearTokens() {
  localStorage.removeItem(TOKENS_KEY);
}

function safeParseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

interface ApiErrorBody {
  error?: string;
}

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const tokens = getTokens();
  if (!tokens) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refresh }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  refreshPromise = refreshPromise ?? doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // Frontend-first (issue #3): tanpa backend, semua request dilayani
  // LocalStorage repository layer — tidak ada fetch, tidak ada 401.
  if (isLocalMode()) {
    const { handleLocalRequest, LocalApiError } = await import("@/lib/data/local-api");
    const method = (options.method ?? "GET").toUpperCase();
    try {
      return await handleLocalRequest<T>(method, path, options.body === undefined ? undefined : safeParseBody(options.body));
    } catch (e) {
      if (e instanceof LocalApiError) throw new ApiError(e.message, e.status);
      throw e;
    }
  }

  const { skipAuth, ...rest } = options;
  const tokens = getTokens();

  const headers = new Headers(rest.headers);
  if (rest.body !== undefined) headers.set("Content-Type", "application/json");
  if (!skipAuth && tokens?.access) {
    headers.set("Authorization", `Bearer ${tokens.access}`);
  }

  let res = await fetch(`${API_URL}${path}`, { ...rest, headers });

  if (res.status === 401 && !skipAuth) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      const newTokens = getTokens();
      const retryHeaders = new Headers(headers);
      if (newTokens?.access) {
        retryHeaders.set("Authorization", `Bearer ${newTokens.access}`);
      }
      res = await fetch(`${API_URL}${path}`, { ...rest, headers: retryHeaders });
    }
  }

  if (!res.ok) {
    let message = `Permintaan gagal (${res.status})`;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (body?.error) message = body.error;
    } catch {
      // respon bukan JSON — pakai pesan default
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  /** POST dengan respon SSE streaming — parse baris "data:" lalu panggil onEvent per event. */
  stream: <T = unknown>(
    path: string,
    body: unknown,
    onEvent: (event: T) => void,
    signal?: AbortSignal
  ): Promise<void> => streamRequest(path, body, onEvent, signal),
  /** GET SSE stream — untuk activity-log realtime. Auth via Bearer header, auto-refresh. */
  subscribe: <T = unknown>(
    path: string,
    onEvent: (event: T) => void,
    signal?: AbortSignal
  ): Promise<void> => subscribeRequest(path, onEvent, signal),
};

async function streamRequest<T>(
  path: string,
  body: unknown,
  onEvent: (event: T) => void,
  signal?: AbortSignal
): Promise<void> {
  // Mode lokal: AI streaming tidak tersedia — beri tahu UI via event error.
  if (isLocalMode()) {
    void path;
    void body;
    try {
      onEvent({ type: "error", message: "AI tidak tersedia di mode lokal (tanpa backend)." } as T);
    } catch {
      // ignore
    }
    return;
  }
  const tokens = getTokens();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (tokens?.access) headers.set("Authorization", `Bearer ${tokens.access}`);

  const doFetch = () =>
    fetch(`${API_URL}${path}`, { method: "POST", headers, body: JSON.stringify(body), signal });

  let res = await doFetch();

  if (res.status === 401) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      const newTokens = getTokens();
      if (newTokens?.access) headers.set("Authorization", `Bearer ${newTokens.access}`);
      res = await doFetch();
    }
  }

  if (!res.ok) {
    let message = `Permintaan gagal (${res.status})`;
    try {
      const b = (await res.json()) as ApiErrorBody;
      if (b?.error) message = b.error;
    } catch {
      // respon bukan JSON — pakai pesan default
    }
    throw new ApiError(message, res.status);
  }

  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        onEvent(JSON.parse(payload) as T);
      } catch {
        // lewati event yang tidak valid
      }
    }
  }
}

async function subscribeRequest<T>(
  path: string,
  onEvent: (event: T) => void,
  signal?: AbortSignal
): Promise<void> {
  // Mode lokal: realtime antar-tab sudah diurus BroadcastChannel (lib/realtime).
  // Tunggu hingga abort agar caller dengan pola "await subscribe" tidak loop retry.
  if (isLocalMode()) {
    void path;
    void onEvent;
    if (signal?.aborted) return;
    await new Promise<void>((resolve) => {
      if (signal) signal.addEventListener("abort", () => resolve(), { once: true });
    });
    return;
  }
  const tokens = getTokens();
  const headers = new Headers({ Accept: "text/event-stream" });
  if (tokens?.access) headers.set("Authorization", `Bearer ${tokens.access}`);

  const doFetch = () =>
    fetch(`${API_URL}${path}`, { method: "GET", headers, signal });

  let res = await doFetch();

  if (res.status === 401) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      const newTokens = getTokens();
      if (newTokens?.access) headers.set("Authorization", `Bearer ${newTokens.access}`);
      res = await doFetch();
    }
  }

  if (!res.ok) {
    let message = `Permintaan gagal (${res.status})`;
    try {
      const b = (await res.json()) as ApiErrorBody;
      if (b?.error) message = b.error;
    } catch {}
    throw new ApiError(message, res.status);
  }

  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    if (signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line || line.startsWith(":")) continue; // comment / heartbeat
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        onEvent(JSON.parse(payload) as T);
      } catch {
        // lewati event tidak valid
      }
    }
  }
}
