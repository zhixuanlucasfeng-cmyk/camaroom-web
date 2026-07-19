import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { checkPassword, makeSessionCookie, isAuthenticated } from '../src/auth.js';

beforeEach(() => {
  env.ADMIN_PASSWORD = 'test-shared-password';
});

describe('checkPassword', () => {
  it('accepts the correct password', () => {
    expect(checkPassword('test-shared-password', env)).toBe(true);
  });

  it('rejects an incorrect password', () => {
    expect(checkPassword('wrong', env)).toBe(false);
  });
});

describe('makeSessionCookie / isAuthenticated', () => {
  it('a request carrying the cookie from makeSessionCookie is authenticated', async () => {
    const cookie = await makeSessionCookie(env);
    const cookieValue = cookie.split(';')[0];
    const request = new Request('https://example.com/admin/quote/ord_1', {
      headers: { cookie: cookieValue },
    });
    expect(await isAuthenticated(request, env)).toBe(true);
  });

  it('a request with no cookie is not authenticated', async () => {
    const request = new Request('https://example.com/admin/quote/ord_1');
    expect(await isAuthenticated(request, env)).toBe(false);
  });

  it('a request with a tampered cookie is not authenticated', async () => {
    const cookie = await makeSessionCookie(env);
    const cookieValue = cookie.split(';')[0];
    const tampered = cookieValue.replace('ok.', 'ok.tampered');
    const request = new Request('https://example.com/admin/quote/ord_1', {
      headers: { cookie: tampered },
    });
    expect(await isAuthenticated(request, env)).toBe(false);
  });
});
