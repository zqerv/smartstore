export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api')
  .replace(/\/+$/, '');

export const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000')
  .replace(/\/+$/, '');

export type ApiEnvelope<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
};

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export type ApiRequestOptions = RequestInit & {
  /** Send without the signed-in user's bearer token (public guest endpoints). */
  anonymous?: boolean;
};

export async function apiRequest<T>(
  path: string,
  { anonymous, ...options }: ApiRequestOptions = {},
): Promise<T> {
  const token = anonymous ? null : localStorage.getItem('smartstore.token');
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError('تعذّر الاتصال بالخادم. تحقق من تشغيل API على المنفذ 5000.', 0, 'NETWORK_ERROR');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const envelope = payload && typeof payload === 'object'
      ? payload as ApiEnvelope
      : undefined;
    const message = envelope?.error || envelope?.message ||
      (response.status === 404
        ? 'المسار غير متاح في نسخة الخادم الحالية.'
        : `تعذّر إكمال الطلب (HTTP ${response.status}).`);
    throw new ApiError(message, response.status, envelope?.code);
  }

  if (payload && typeof payload === 'object' && 'success' in payload) {
    const envelope = payload as ApiEnvelope<T>;
    if (envelope.success === false) {
      throw new ApiError(envelope.error || envelope.message || 'فشل الطلب.', response.status, envelope.code);
    }
    if ('data' in envelope) return envelope.data as T;
  }

  return payload as T;
}

export function apiPath(...parts: Array<string | undefined>): string | null {
  if (parts.some((part) => !part)) return null;
  return `/${parts.map((part) => encodeURIComponent(part!)).join('/')}`;
}
