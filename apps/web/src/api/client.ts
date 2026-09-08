/**
 * The one place the browser talks to the server.
 *
 * The API and the app are served from the same origin, so the session cookie travels
 * without any CORS ceremony and there is no token to keep in storage.
 */

export type ApiErrorCode =
  | 'validation_failed'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'email_taken'
  | 'invalid_credentials'
  | 'rate_limited'
  | 'conflict'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'internal_error'
  | 'offline';

export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly fields: FieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The message for a particular form field, if the server pointed at one. */
  fieldError(path: string): string | undefined {
    return this.fields.find((field) => field.path === path)?.message;
  }
}

const BASE = '/api/v1';

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';

  const init: RequestInit = { method, credentials: 'same-origin' };
  if (options.body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }
  if (options.signal) init.signal = options.signal;

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    // A write with no network fails loudly. Queuing it silently would let an owner believe
    // a vaccination was recorded when it never left the phone.
    throw new ApiError(0, 'offline', 'no connection');
  }

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
  const payload: unknown = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const body = payload as {
      error?: { code?: ApiErrorCode; message?: string; details?: { fields?: FieldError[] } };
    };
    throw new ApiError(
      response.status,
      body.error?.code ?? 'internal_error',
      body.error?.message ?? 'request failed',
      body.error?.details?.fields ?? [],
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** Multipart, because a file is not JSON. */
  upload: async <T>(path: string, file: File): Promise<T> => {
    const form = new FormData();
    form.append('file', file);

    let response: Response;
    try {
      response = await fetch(`${BASE}${path}`, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      });
    } catch {
      throw new ApiError(0, 'offline', 'no connection');
    }

    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const body = payload as { error?: { code?: ApiErrorCode; message?: string } };
      throw new ApiError(
        response.status,
        body.error?.code ?? 'internal_error',
        body.error?.message ?? 'upload failed',
      );
    }
    return payload as T;
  },
};
