import { getGoogleIdToken } from './googleAuth';
import { PlayBilling, type PlayPurchase } from './playBilling';
import { withTimeout, STORE_TIMEOUT_MS, PURCHASE_TIMEOUT_MS } from './pro';
import { useAuthStore } from '../store/authStore';
import { restorePointPurchases } from './pointPurchases';
import { usePointsStore } from '../store/pointsStore';

usePointsStore.getState().setSubject(useAuthStore.getState().account?.subject ?? null);
useAuthStore.subscribe((state, previous) => {
  if (state.account?.subject !== previous.account?.subject) {
    usePointsStore.getState().setSubject(state.account?.subject ?? null);
  }
});

const BASE = (import.meta.env.VITE_CLOUD_SYNC_URL ?? '').replace(/\/$/, '');
export interface AiJob { id: string; status: 'reserved' | 'queued' | 'complete' | 'failed'; style: string; charged: number; error: string | null;
  /** The result must carry the homedesignerapp.com watermark (free account, cheaper render). */
  watermark?: boolean }
export interface AiRenderStyle { id: string; label: string }
export interface AiState { enabled: boolean; isPro: boolean; freeAvailable: boolean; styles: AiRenderStyle[]; latest: AiJob | null }
export interface PointPack { id: string; points: number; playProductId: string; priceCents: number }
export interface PointsState {
  balance: number; features: Record<string, { points: number }>; packs: PointPack[]; cardCheckout: boolean;
  /** Provider-backed tools this server can run. Absent on an older Worker,
   *  which is read as "none" so the app never offers a tool that would 404. */
  available?: { design_review?: boolean; voice_tour?: boolean; plan_design?: boolean };
}

async function aiRequest<T>(path: string, body: unknown, read: (response: Response) => Promise<T>, timeoutMs = 30_000): Promise<T> {
  if (!BASE) throw new Error('AI features are not configured in this build.');
  const subject = useAuthStore.getState().account?.subject;
  if (!subject) throw new Error('Sign in to use AI features.');
  const readRevision = usePointsStore.getState().revision;
  const accountGeneration = usePointsStore.getState().generation;
  const token = await getGoogleIdToken();
  if (subject !== useAuthStore.getState().account?.subject || accountGeneration !== usePointsStore.getState().generation) throw new Error('Account changed. Please reopen AI tools.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(error.error || `AI service unavailable (${response.status}).`);
    }
    const value = await read(response);
    if (subject !== useAuthStore.getState().account?.subject || accountGeneration !== usePointsStore.getState().generation) throw new Error('Account changed. Please reopen AI tools.');
    const refreshBalance = body !== undefined && value && typeof value === 'object'
      && Number.isSafeInteger((value as { balance?: unknown }).balance)
      && readRevision !== usePointsStore.getState().revision;
    usePointsStore.getState().observe(subject, path, value, readRevision);
    if (refreshBalance) void aiJson<PointsState>('/v1/points').catch(() => undefined);
    return value;
  } finally { clearTimeout(timer); }
}
export async function aiJson<T>(path: string, body?: unknown, timeoutMs?: number): Promise<T> { return aiRequest(path, body, response => response.json() as Promise<T>, timeoutMs); }

export async function imageDataUrl(id: string): Promise<string> {
  const blob = await aiRequest(`/v1/ai/renders/${id}/image`, undefined, response => response.blob());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the AI image.'));
    reader.readAsDataURL(blob);
  });
}

async function claimPack(purchase: PlayPurchase) {
  if (purchase.purchaseState !== 1) throw new Error('Payment is pending. Restore point purchases after Google Play completes it.');
  await aiJson('/v1/points/play/claim', { purchaseToken: purchase.purchaseToken });
}
async function playAccountId(subject: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`homedesigner-play:${subject}`));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function buyPlayPoints(pack: PointPack) {
  const subject = useAuthStore.getState().account?.subject;
  if (!subject) throw new Error('Sign in before buying AI points.');
  const obfuscatedAccountId = await playAccountId(subject);
  if (subject !== useAuthStore.getState().account?.subject) throw new Error('Account changed. Please try again.');
  const result = await withTimeout(PlayBilling.purchase({
    productId: pack.playProductId,
    obfuscatedAccountId,
  }), PURCHASE_TIMEOUT_MS,
    'Purchase is still pending. Use Restore point purchases before buying again.');
  if (subject !== useAuthStore.getState().account?.subject) throw new Error('Account changed. Sign back in and restore point purchases.');
  if (!result.purchase) throw new Error('No completed purchase returned.');
  await claimPack(result.purchase);
}
export async function restorePlayPoints() {
  const subject = useAuthStore.getState().account?.subject;
  if (!subject) throw new Error('Sign in before restoring AI points.');
  const { purchases } = await withTimeout(PlayBilling.getPurchases(), STORE_TIMEOUT_MS, 'Google Play did not respond.');
  await restorePointPurchases(purchases, claimPack, () => subject === useAuthStore.getState().account?.subject);
}
