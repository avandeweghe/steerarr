import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Login sessions are signed cookies, so nothing is kept on the server: `<expires>.<signature>`,
 * where the signature is an HMAC of the expiry with the login's secret. A new secret (the
 * username or password changed, every device was logged out, or the login was turned off) makes
 * every old cookie invalid.
 *
 * A device stays logged in until it's logged out: each session lasts 400 days (the longest
 * browsers keep a cookie) and is renewed whenever the app is used.
 */
export const SESSION_COOKIE = 'steerarr_session';
export const SESSION_DAYS = 400;

const DAY_SECONDS = 24 * 60 * 60;
const SESSION_SECONDS = SESSION_DAYS * DAY_SECONDS;

/** A token valid for SESSION_DAYS from `now` (seconds since the epoch). */
export function createToken(secret: Buffer, now = nowSeconds()): string {
  const expires = now + SESSION_SECONDS;
  return `${expires}.${sign(secret, expires)}`;
}

/** The token's expiry if it's genuine and still valid, else null. */
export function checkToken(token: string, secret: Buffer, now = nowSeconds()): number | null {
  const match = /^(\d{1,12})\.([\w-]{43})$/.exec(token);
  if (!match) return null;
  const expires = Number(match[1]);
  const expected = Buffer.from(sign(secret, expires));
  const actual = Buffer.from(match[2] ?? '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return expires > now ? expires : null;
}

/** Sessions slide: a token is renewed once it's more than a day old. */
export function needsRenewal(expires: number, now = nowSeconds()): boolean {
  return expires - now < SESSION_SECONDS - DAY_SECONDS;
}

export function readSessionCookie(request: FastifyRequest): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return value.join('=');
  }
  return null;
}

export function setSessionCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
): void {
  reply.header('Set-Cookie', cookie(request, `${SESSION_COOKIE}=${token}`, SESSION_SECONDS));
}

export function clearSessionCookie(request: FastifyRequest, reply: FastifyReply): void {
  reply.header('Set-Cookie', cookie(request, `${SESSION_COOKIE}=`, 0));
}

/**
 * HttpOnly so page scripts can't read it, SameSite=Strict so other sites can't use it, and
 * Secure when the request came in over https (Caddy and other proxies say so in
 * X-Forwarded-Proto, which Fastify trusts from TRUST_PROXY addresses).
 */
function cookie(request: FastifyRequest, value: string, maxAge: number): string {
  const secure = request.protocol === 'https' ? '; Secure' : '';
  return `${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`;
}

function sign(secret: Buffer, expires: number): string {
  return createHmac('sha256', secret).update(`steerarr-session:${expires}`).digest('base64url');
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
