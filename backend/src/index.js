import { handleCreateOrder } from './orders.js';
import { handleGetQuotePage, handleSubmitQuote } from './quote.js';
import { isAuthenticated, checkPassword, makeSessionCookie } from './auth.js';
import { handleFlutterwaveWebhook } from './webhook.js';

const LOGIN_PAGE = `<!doctype html><html><body>
<form id="loginForm"><input type="password" id="pw" placeholder="Password"><button>Enter</button></form>
<script>
  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    fetch('/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: document.getElementById('pw').value }),
    }).then(function (res) {
      if (res.ok) { window.location.reload(); }
      else { alert('Wrong password'); }
    });
  });
</script>
</body></html>`;

// The storefront (index.html) is served from a different origin than this
// Worker (e.g. a static host on one domain, the Worker on *.workers.dev), so
// the browser's cross-origin checks apply to /api/orders. Allow any origin
// to POST here — it's a public order-intake endpoint, not authenticated.
const CART_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/orders' && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CART_CORS_HEADERS });
    }

    if (pathname === '/api/orders' && request.method === 'POST') {
      const res = await handleCreateOrder(request, env);
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(CART_CORS_HEADERS)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    }

    const quoteApiMatch = pathname.match(/^\/api\/orders\/([^/]+)\/quote$/);
    if (quoteApiMatch && request.method === 'POST') {
      if (!(await isAuthenticated(request, env))) {
        return new Response('Unauthorized', { status: 401 });
      }
      return handleSubmitQuote(request, env, quoteApiMatch[1]);
    }

    if (pathname === '/admin/login' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!checkPassword(body.password, env)) {
        return new Response(JSON.stringify({ error: 'wrong_password' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'set-cookie': await makeSessionCookie(env), 'content-type': 'application/json' },
      });
    }

    const quotePageMatch = pathname.match(/^\/admin\/quote\/([^/]+)$/);
    if (quotePageMatch && request.method === 'GET') {
      if (!(await isAuthenticated(request, env))) {
        return new Response(LOGIN_PAGE, { status: 401, headers: { 'content-type': 'text/html' } });
      }
      return handleGetQuotePage(request, env, quotePageMatch[1]);
    }

    if (pathname === '/api/webhook/flutterwave' && request.method === 'POST') {
      return handleFlutterwaveWebhook(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};
