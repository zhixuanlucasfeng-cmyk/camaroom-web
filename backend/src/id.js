// Crockford Base32 alphabet (excludes I, L, O, U) — 32 symbols so
// `byte % ALPHABET.length` has no modulo bias over a 0-255 byte range, and
// the excluded letters avoid 0/O and 1/I/L mix-ups when a customer reads
// this off a screen and types it into their phone's MoMo/Orange Money
// transfer note, or a sales rep reads it back off their own transfer log.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateOrderId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `REST-${code}`;
}
