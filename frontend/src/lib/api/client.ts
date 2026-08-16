export interface TokenPair {
  access: string;
  refresh: string;
}

const TOKENS_KEY = "so_tokens";
const API_URL = import.meta.env.VITE_API_URL ?? "/api";

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
};

async function streamRequest<T>(
  path: string,
  body: unknown,
  onEvent: (event: T) => void,
  signal?: AbortSignal
): Promise<void> {
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
