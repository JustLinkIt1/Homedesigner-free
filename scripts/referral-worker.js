// Cloudflare Worker — referral code counter with a hard cap.
//
// Deploy this as a Cloudflare Worker with a KV namespace binding named
// "REFERRAL". The app calls POST /redeem with { code: "..." } and the
// worker tracks how many times the code has been used globally.
//
// Setup (5 minutes, free tier):
//   1. Sign in at https://dash.cloudflare.com → Workers & Pages → Create
//   2. Name it e.g. "homedesigner-referral", click Deploy
//   3. Edit the code → paste this entire file → Save and Deploy
//   4. Go to Settings → Variables → KV Namespace Bindings
//      → Add binding: Variable name = REFERRAL, select or create a namespace
//   5. Copy the worker URL (e.g. https://homedesigner-referral.you.workers.dev)
//   6. Set VITE_REFERRAL_API=<that URL> in your build environment
//      (or .env.local for dev, or Capacitor environment for Android builds)
//
// To check current redemption count:
//   curl https://homedesigner-referral.you.workers.dev/status
//
// To reset the counter:
//   In the Cloudflare dashboard → KV → your namespace → delete the "count" key

const MAX_REDEMPTIONS = 50;

const VALID_CODES = {
  HOMEDESIGN50: true,
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    // GET /status — how many slots remain (public, no auth)
    if (url.pathname === '/status' && request.method === 'GET') {
      const count = parseInt(await env.REFERRAL.get('count') || '0', 10);
      return json({ redeemed: count, remaining: Math.max(0, MAX_REDEMPTIONS - count) });
    }

    // POST /redeem — try to claim a slot
    if (url.pathname === '/redeem' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: 'bad request' }, 400);
      }

      const code = (body.code || '').trim().toUpperCase().replace(/[\s-]/g, '');
      if (!VALID_CODES[code]) {
        return json({ ok: false, error: 'invalid' }, 400);
      }

      const count = parseInt(await env.REFERRAL.get('count') || '0', 10);
      if (count >= MAX_REDEMPTIONS) {
        return json({ ok: false, remaining: 0 }, 410);
      }

      await env.REFERRAL.put('count', String(count + 1));
      return json({ ok: true, remaining: MAX_REDEMPTIONS - count - 1 });
    }

    return json({ error: 'not found' }, 404);
  },
};
