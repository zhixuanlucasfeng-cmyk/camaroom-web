/* Cloudflare Pages function: tells the page which country the visitor is
 * browsing from, so assets/js/countries.js can preselect it.
 *
 * request.cf.country is Cloudflare's own IP geolocation — no third-party
 * lookup, no API key, and it never leaves the edge. Unknown/reserved IPs
 * give null, which resolveCountry() treats as "fall through to OTHER".
 */
export function onRequestGet({ request }) {
  const country = (request.cf && request.cf.country) || null;
  return new Response(JSON.stringify({ country }), {
    headers: {
      'content-type': 'application/json',
      // Per-visitor answer — a shared cache would hand one country's result
      // to everyone behind the same edge.
      'cache-control': 'no-store'
    }
  });
}
