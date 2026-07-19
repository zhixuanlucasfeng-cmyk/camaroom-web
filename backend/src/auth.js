import { timingSafeEqual } from './util.js';

const COOKIE_NAME = 'admin_session';

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export function checkPassword(password, env) {
  return typeof password === 'string' && timingSafeEqual(password, env.ADMIN_PASSWORD);
}

export async function makeSessionCookie(env) {
  const value = 'ok';
  const sig = await sign(value, env.ADMIN_PASSWORD);
  return `${COOKIE_NAME}=${value}.${sig}; HttpOnly; Secure; Path=/; Max-Age=86400; SameSite=Strict`;
}

export async function isAuthenticated(request, env) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  const dotIndex = match[1].indexOf('.');
  if (dotIndex === -1) return false;
  const value = match[1].slice(0, dotIndex);
  const sig = match[1].slice(dotIndex + 1);
  const expectedSig = await sign(value, env.ADMIN_PASSWORD);
  return timingSafeEqual(sig, expectedSig);
}
