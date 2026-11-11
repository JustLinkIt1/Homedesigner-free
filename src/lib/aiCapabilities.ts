import { create } from 'zustand';

const BASE = (import.meta.env.VITE_CLOUD_SYNC_URL ?? '').replace(/\/$/, '');

/** Which provider-backed AI tools the server can run right now. */
export interface AiCapabilities {
  design_review?: boolean;
  voice_tour?: boolean;
  plan_design?: boolean;
}

/**
 * Read once per launch from a public endpoint, so entry points such as
 * "Create a plan with AI" can be shown (or not) before anyone signs in.
 * Empty until it loads and whenever it fails: an entry point that leads to
 * "not available" is worse than no entry point.
 */
export const useAiCapabilities = create<AiCapabilities>(() => ({}));

let started = false;
export function loadAiCapabilities(): void {
  if (started || !BASE) return;
  started = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  fetch(`${BASE}/v1/ai/capabilities`, { signal: controller.signal })
    .then((response) => (response.ok ? response.json() : null))
    .then((value: unknown) => {
      if (!value || typeof value !== 'object') return;
      const caps = value as Record<string, unknown>;
      useAiCapabilities.setState({
        design_review: caps.design_review === true,
        voice_tour: caps.voice_tour === true,
        plan_design: caps.plan_design === true,
      });
    })
    .catch(() => { started = false; })
    .finally(() => clearTimeout(timer));
}
