import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { getOrCreateAssignment, linkOrderToAssignment } from '../src/rep_assignment.js';

const repsSchema = 'CREATE TABLE sales_reps (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);';
const assignmentsSchema =
  'CREATE TABLE rep_assignments (session_id TEXT PRIMARY KEY, rep_id TEXT NOT NULL, source TEXT NOT NULL, order_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);';
const ordersSchema =
  'CREATE TABLE orders (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, items TEXT NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT "submitted", quoted_price INTEGER, paid_at TEXT, shipment_id TEXT);';

async function seedReps() {
  const reps = [
    ['rep-1', 'Yamadou', '22370750537'],
    ['rep-2', 'Mamadou Keita', '22374065652'],
    ['rep-3', 'Ousman Maiga', '22375887769'],
  ];
  for (const [id, name, phone] of reps) {
    await env.DB.prepare('INSERT INTO sales_reps (id, name, phone, active) VALUES (?, ?, ?, 1)').bind(id, name, phone).run();
  }
}

beforeEach(async () => {
  await env.DB.exec('DROP TABLE IF EXISTS rep_assignments');
  await env.DB.exec('DROP TABLE IF EXISTS sales_reps');
  await env.DB.exec('DROP TABLE IF EXISTS orders');
  await env.DB.exec(repsSchema);
  await env.DB.exec(assignmentsSchema);
  await env.DB.exec(ordersSchema);
  await seedReps();
});

describe('getOrCreateAssignment', () => {
  it('assigns a random active rep to a new session', async () => {
    const result = await getOrCreateAssignment(env.DB, 'session-1', 'nav_whatsapp');
    expect(['rep-1', 'rep-2', 'rep-3']).toContain(result.rep_id);
    expect(result.name).toBeTruthy();
    expect(result.phone).toBeTruthy();
    expect(result.source).toBe('nav_whatsapp');
  });

  it('returns the same rep for the same session on repeated calls, even with a different source', async () => {
    const first = await getOrCreateAssignment(env.DB, 'session-1', 'nav_whatsapp');
    const second = await getOrCreateAssignment(env.DB, 'session-1', 'contact_form');
    expect(second.rep_id).toBe(first.rep_id);
    expect(second.source).toBe('nav_whatsapp'); // first-touch source is preserved, not overwritten
  });

  it('can assign different sessions to different reps', async () => {
    // Deterministic: stub Math.random to force distinct picks across two sessions.
    const spy = vi.spyOn(Math, 'random');
    spy.mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    const a = await getOrCreateAssignment(env.DB, 'session-a', 'hero_whatsapp');
    const b = await getOrCreateAssignment(env.DB, 'session-b', 'hero_whatsapp');
    expect(a.rep_id).not.toBe(b.rep_id);
    spy.mockRestore();
  });

  it('never assigns an inactive rep', async () => {
    await env.DB.prepare('UPDATE sales_reps SET active = 0 WHERE id != ?').bind('rep-2').run();
    const result = await getOrCreateAssignment(env.DB, 'session-1', 'nav_whatsapp');
    expect(result.rep_id).toBe('rep-2');
  });

  it('throws if there are no active reps configured', async () => {
    await env.DB.prepare('UPDATE sales_reps SET active = 0').run();
    await expect(getOrCreateAssignment(env.DB, 'session-1', 'nav_whatsapp')).rejects.toThrow('no_active_reps');
  });

  it('rejects a missing session id', async () => {
    await expect(getOrCreateAssignment(env.DB, '', 'nav_whatsapp')).rejects.toThrow('invalid_session');
  });
});

describe('linkOrderToAssignment', () => {
  it('sets order_id on an existing session assignment', async () => {
    const assignment = await getOrCreateAssignment(env.DB, 'session-1', 'nav_whatsapp');
    await linkOrderToAssignment(env.DB, 'session-1', 'REST-ABC123', 'order');

    const row = await env.DB.prepare('SELECT * FROM rep_assignments WHERE session_id = ?').bind('session-1').first();
    expect(row.order_id).toBe('REST-ABC123');
    expect(row.rep_id).toBe(assignment.rep_id);
    expect(row.source).toBe('nav_whatsapp'); // still the original first-touch source
  });

  it('creates a fresh assignment if the session had none yet, using the given fallback source', async () => {
    await linkOrderToAssignment(env.DB, 'brand-new-session', 'REST-XYZ789', 'order');

    const row = await env.DB.prepare('SELECT * FROM rep_assignments WHERE session_id = ?').bind('brand-new-session').first();
    expect(row.order_id).toBe('REST-XYZ789');
    expect(row.source).toBe('order');
    expect(['rep-1', 'rep-2', 'rep-3']).toContain(row.rep_id);
  });
});
