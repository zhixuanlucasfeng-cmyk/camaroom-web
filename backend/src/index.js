import { handleCreateOrder } from './orders.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/orders' && request.method === 'POST') {
      return handleCreateOrder(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};
