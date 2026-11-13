// Shared plans: a plan handed to someone by link.
//
// A row holds a small plan description (the AI-plan "blueprint", plus an
// optional outside finish and roof), not a full project: the app builds and
// furnishes the project from it on arrival, the same way it does for an AI
// plan. That keeps a row to a few kilobytes and means a link can never carry
// anything the app's own plan builder would not produce.
//
// Rows are written by the site owner straight into D1, never through a route,
// so the whole public surface is one read by id. The id is the secret: long
// and random enough that links cannot be guessed or walked.

/** Lowercase letters and digits only, so a link survives being retyped. */
export const SHARED_PLAN_PATH = /^\/v1\/plans\/shared\/([a-z0-9]{10,24})$/;

/** The stored plan, or null when the link is unknown, withdrawn or expired. */
export async function readSharedPlan(db: D1Database, id: string, now: number): Promise<unknown | null> {
  const row = await db
    .prepare('SELECT payload FROM shared_plans WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)')
    .bind(id, now)
    .first<{ payload: string }>();
  if (!row) return null;
  try {
    const payload: unknown = JSON.parse(row.payload);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/** Counts an open, so the owner can see whether a link was ever followed. */
export async function countSharedPlanOpen(db: D1Database, id: string, now: number): Promise<void> {
  await db
    .prepare('UPDATE shared_plans SET opened = opened + 1, last_opened_at = ? WHERE id = ?')
    .bind(now, id)
    .run();
}
