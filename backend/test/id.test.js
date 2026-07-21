import { describe, it, expect } from 'vitest';
import { generateOrderId } from '../src/id.js';

describe('generateOrderId', () => {
  it('matches the REST-XXXXXX format used as the MoMo/OM transfer reference', () => {
    expect(generateOrderId()).toMatch(/^REST-[0-9A-Z]{6}$/);
  });

  it('never contains I, L, O, or U — excluded to avoid transcription errors', () => {
    for (let i = 0; i < 200; i++) {
      const id = generateOrderId();
      expect(id).not.toMatch(/[ILOU]/);
    }
  });

  it('is not trivially predictable across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateOrderId()));
    expect(ids.size).toBe(50);
  });
});
