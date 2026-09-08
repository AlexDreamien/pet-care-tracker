import { ZodError } from 'zod';

/**
 * Errors carry a code from a closed set. The client switches on the code and shows its own
 * wording; the message here is for a developer reading a log, not for an owner reading a
 * screen — it is never translated and never shown verbatim.
 */
export type ErrorCode =
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
  | 'internal_error';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (code: ErrorCode, message: string, details?: unknown) =>
  new ApiError(400, code, message, details);
export const unauthenticated = () => new ApiError(401, 'unauthenticated', 'sign in to continue');
export const forbidden = (message = 'not permitted') => new ApiError(403, 'forbidden', message);
export const notFound = (what = 'resource') => new ApiError(404, 'not_found', `${what} not found`);
export const conflict = (message: string) => new ApiError(409, 'conflict', message);

/** Field-level detail, so a form can put the message next to the input that caused it. */
export function validationFailed(error: ZodError): ApiError {
  const fields = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  return new ApiError(422, 'validation_failed', 'the request body is not valid', { fields });
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export function toErrorBody(error: ApiError): ErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}
