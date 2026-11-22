import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiErrorBody, ApiErrorCode } from '@steerarr/shared';
import { SettingsWriteError } from './settings-store.js';
import { UpstreamError } from './upstream-error.js';

/** A service's routes were called before its settings were saved. */
export class NotConfiguredError extends Error {
  override name = 'NotConfiguredError';

  constructor(serviceName: string) {
    super(`${serviceName} isn't set up yet. Add its address and API key in Steerarr's settings.`);
  }
}

/** The request itself is invalid. The message is shown to the user as-is. */
export class BadRequestError extends Error {
  override name = 'BadRequestError';
  readonly statusCode = 400;
}

/** The item asked for doesn't exist (e.g. a season the series doesn't have). Shown as-is. */
export class NotFoundError extends Error {
  override name = 'NotFoundError';
  readonly statusCode = 404;
}

/**
 * Steerarr's own login (see auth.ts). These are the only 401s Steerarr sends, and always with a
 * JSON body: the app tells them apart from a proxy's login by that body.
 */
export class AuthError extends Error {
  override name = 'AuthError';
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  static loginRequired(): AuthError {
    return new AuthError(401, 'login_required', 'Log in to use Steerarr.');
  }

  static loginFailed(): AuthError {
    return new AuthError(401, 'login_failed', 'Wrong username or password.');
  }

  static tooManyAttempts(minutes: number): AuthError {
    const wait = minutes === 1 ? 'a minute' : `${minutes} minutes`;
    return new AuthError(
      429,
      'too_many_attempts',
      `Too many failed logins from this device. Try again in ${wait}.`,
    );
  }

  static unavailable(reason: string): AuthError {
    return new AuthError(503, 'login_unavailable', reason);
  }
}

/** Sends every error as an ApiErrorBody, and maps upstream failures to sensible statuses. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => handleError(error, request, reply));

  app.setNotFoundHandler((request, reply) =>
    sendError(reply, 404, 'not_found', `No route for ${request.method} ${request.url}`),
  );
}

function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof UpstreamError) {
    const { status, code, message } = describeUpstreamError(error);
    request.log.warn(
      { service: error.service, kind: error.kind, upstreamStatus: error.status },
      error.message,
    );
    const details = code === 'bad_request' ? error.body : undefined;
    return sendError(reply, status, code, message, details);
  }

  if (error instanceof AuthError) {
    return sendError(reply, error.status, error.code, error.message);
  }

  // 503, never 401/404: to the app a 401 means a login is needed, and a 404 a missing item.
  if (error instanceof NotConfiguredError) {
    return sendError(reply, 503, 'not_configured', error.message);
  }

  if (error instanceof SettingsWriteError) {
    request.log.error(error.message);
    return sendError(reply, 500, 'internal', error.message);
  }

  const fastifyError = error as { statusCode?: number; validation?: unknown; message?: string };
  const statusCode = fastifyError.statusCode;
  if (fastifyError.validation || (statusCode && statusCode >= 400 && statusCode < 500)) {
    const status = statusCode && statusCode >= 400 && statusCode < 500 ? statusCode : 400;
    const code: ApiErrorCode = status === 404 ? 'not_found' : 'bad_request';
    return sendError(reply, status, code, fastifyError.message ?? 'Bad request');
  }

  request.log.error({ err: error }, 'Unhandled error');
  return sendError(
    reply,
    500,
    'internal',
    'Something went wrong in Steerarr. Check the server logs.',
  );
}

function describeUpstreamError(error: UpstreamError): {
  status: number;
  code: ApiErrorCode;
  message: string;
} {
  const { service, kind, status } = error;
  if (kind === 'timeout') {
    return {
      status: 504,
      code: 'upstream_timeout',
      message: `${error.message}. Check that ${service} is running and not overloaded.`,
    };
  }
  if (kind === 'network') {
    return {
      status: 502,
      code: 'upstream_unreachable',
      message: `${error.message}. Check that ${service} is running and its address in Steerarr's settings is right.`,
    };
  }

  // Never pass 401/403 through: to the app that would look like its own login expiring.
  if (status === 401 || status === 403) {
    return {
      status: 502,
      code: 'upstream_auth',
      message:
        error.credentials === 'login'
          ? `${service} rejected the username or password. Check them in Steerarr's settings.`
          : `${service} rejected the API key. Check the API key in Steerarr's settings.`,
    };
  }
  if (status !== undefined && status >= 300 && status < 400) {
    return {
      status: 502,
      code: 'upstream_error',
      message: `${service} redirected the request (HTTP ${status}), probably to a login page. Use an address that reaches ${service}'s API directly.`,
    };
  }
  if (status === 404) {
    // The *arr apps answer a missing item with JSON. Anything else means the address is wrong.
    if (error.body === undefined) {
      return {
        status: 502,
        code: 'upstream_error',
        message: `${service} answered "not found" for its own API. Check ${service}'s address in Steerarr's settings, including any URL base such as /${service.toLowerCase()}.`,
      };
    }
    return { status: 404, code: 'not_found', message: `${service} couldn't find that item` };
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return {
      status,
      code: 'bad_request',
      message: upstreamMessage(error.body) ?? `${service} rejected the request (HTTP ${status})`,
    };
  }
  // e.g. a search that failed inside Sonarr: its own message says why.
  const detail = status !== undefined && status >= 500 ? upstreamMessage(error.body) : undefined;
  return {
    status: 502,
    code: 'upstream_error',
    message: detail ? `${service} failed: ${detail}` : error.message,
  };
}

/** *arr errors come as { message } or as a list of validation failures [{ errorMessage }]. */
function upstreamMessage(body: unknown): string | undefined {
  if (Array.isArray(body)) {
    const messages = body
      .map((item) => (item as { errorMessage?: unknown }).errorMessage)
      .filter((message): message is string => typeof message === 'string');
    return messages.length > 0 ? messages.join(' ') : undefined;
  }
  const message = (body as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' ? message : undefined;
}

function sendError(
  reply: FastifyReply,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
) {
  const body: ApiErrorBody = {
    error: details === undefined ? { code, message } : { code, message, details },
  };
  return reply.status(status).send(body);
}
