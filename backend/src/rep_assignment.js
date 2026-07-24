// Session-consistent random sales-rep assignment. A session's first touch
// (any WhatsApp entry point, or going straight to checkout) picks one
// active rep and pins it in rep_assignments — every later call for the same
// session_id returns that same rep rather than reassigning, and the
// original first-touch `source` is preserved even if later calls pass a
// different one.

function nowIso() {
  return new Date().toISOString();
}

async function pickRandomActiveRep(db) {
  const { results } = await db.prepare('SELECT id FROM sales_reps WHERE active = 1').all();
  if (results.length === 0) {
    throw new Error('no_active_reps');
  }
  const pick = results[Math.floor(Math.random() * results.length)];
  return pick.id;
}

async function getAssignmentWithRep(db, sessionId) {
  return db
    .prepare(
      `SELECT rep_assignments.session_id, rep_assignments.rep_id, rep_assignments.source,
              rep_assignments.order_id, sales_reps.name, sales_reps.phone
       FROM rep_assignments JOIN sales_reps ON sales_reps.id = rep_assignments.rep_id
       WHERE rep_assignments.session_id = ?`
    )
    .bind(sessionId)
    .first();
}

export async function getOrCreateAssignment(db, sessionId, source) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('invalid_session');
  }

  const existing = await getAssignmentWithRep(db, sessionId);
  if (existing) {
    return existing;
  }

  const repId = await pickRandomActiveRep(db);
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO rep_assignments (session_id, rep_id, source, order_id, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`
    )
    .bind(sessionId, repId, source, timestamp, timestamp)
    .run();

  return getAssignmentWithRep(db, sessionId);
}

export async function linkOrderToAssignment(db, sessionId, orderId, fallbackSource) {
  const assignment = await getOrCreateAssignment(db, sessionId, fallbackSource);
  await db
    .prepare('UPDATE rep_assignments SET order_id = ?, updated_at = ? WHERE session_id = ?')
    .bind(orderId, nowIso(), sessionId)
    .run();
  return { ...assignment, order_id: orderId };
}

export async function handleGetSalesRep(request, env) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session');
  const source = searchParams.get('source') || 'unknown';
  try {
    const assignment = await getOrCreateAssignment(env.DB, sessionId, source);
    return new Response(JSON.stringify(assignment), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
}
