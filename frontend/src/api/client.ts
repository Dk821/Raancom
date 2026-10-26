const BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';
const TOKEN_KEY = 'raancom_token';

// sessionStorage: the token disappears when the tab/browser is closed.
let token: string | null = null;
try {
  token = sessionStorage.getItem(TOKEN_KEY);
} catch {
  token = null;
}

export function setToken(t: string | null) {
  token = t;
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: token lives in memory only */
  }
}
export const hasToken = () => !!token;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function qs(query?: Query) {
  if (!query) return '';
  const p = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function errorFrom(res: Response): Promise<ApiError> {
  let msg = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    if (typeof data?.detail === 'string') msg = data.detail;
    else if (Array.isArray(data?.detail)) msg = data.detail.map((d: { msg?: string }) => d.msg).join('; ');
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(res.status, msg);
}

async function raw(path: string, init: RequestInit & { query?: Query } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${qs(init.query)}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    const err = await errorFrom(res);
    if (res.status === 401 && token && !path.startsWith('/auth/login')) {
      window.dispatchEvent(new Event('auth:expired'));
    }
    if (res.status === 403 && err.message === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new Event('auth:password-change'));
    }
    throw err;
  }
  return res;
}

async function json<T>(path: string, method: string, body?: unknown, query?: Query): Promise<T> {
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await raw(path, { method, headers, body: payload, query });
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(path: string, query?: Query) => json<T>(path, 'GET', undefined, query),
  post: <T,>(path: string, body?: unknown) => json<T>(path, 'POST', body ?? {}),
  put: <T,>(path: string, body?: unknown) => json<T>(path, 'PUT', body),
  patch: <T,>(path: string, body?: unknown) => json<T>(path, 'PATCH', body),
  del: <T,>(path: string) => json<T>(path, 'DELETE'),
  upload: <T,>(path: string, form: FormData) => json<T>(path, 'POST', form),
  /** Fetches a protected file (photo, attachment) as a Blob using the auth header. */
  blob: async (path: string): Promise<Blob> => (await raw(path)).blob(),
  /** Downloads a generated file, e.g. a CSV/XLSX export. */
  download: async (path: string, query: Query, fallbackName: string) => {
    const res = await raw(path, { query });
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') ?? '';
    const name = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? fallbackName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};
