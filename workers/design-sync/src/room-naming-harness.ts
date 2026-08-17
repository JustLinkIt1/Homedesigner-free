/**
 * DEV-ONLY entry for measuring room-naming accuracy against the real model.
 *
 * Never deployed and never referenced by `wrangler.jsonc` — it is served by
 * `wrangler dev --remote --config wrangler.harness.jsonc`, which runs on
 * Cloudflare's edge with the real `AI` binding but is reachable only from this
 * machine. It deliberately has no auth and no ledger: the point is to measure
 * what the model answers, and routing that through points and Google JWTs would
 * only add ways for the measurement to fail without telling us anything about
 * naming quality.
 *
 * Run it through `tools/room-naming-accuracy.mjs`.
 */
import { generateRoomNames, validRoomSummaries } from './ai-features';

interface HarnessEnv {
  AI: Ai;
}

export default {
  async fetch(request: Request, env: HarnessEnv): Promise<Response> {
    if (request.method !== 'POST') return new Response('POST fixtures here', { status: 405 });
    const body = await request.json() as { rooms?: unknown };
    const rooms = validRoomSummaries(body.rooms);
    if (!rooms) return Response.json({ error: 'invalid room summaries' }, { status: 400 });
    const startedAt = Date.now();
    try {
      const suggestions = await generateRoomNames(env.AI, rooms);
      return Response.json({ suggestions, ms: Date.now() - startedAt });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error), ms: Date.now() - startedAt },
        { status: 502 },
      );
    }
  },
};
