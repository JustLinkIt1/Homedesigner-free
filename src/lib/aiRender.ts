import { getGoogleIdToken } from './googleAuth';
import { PlayBilling, type PlayPurchase } from './playBilling';
import { withTimeout, STORE_TIMEOUT_MS, PURCHASE_TIMEOUT_MS } from './pro';
import { useAuthStore } from '../store/authStore';

const BASE = (import.meta.env.VITE_CLOUD_SYNC_URL ?? '').replace(/\/$/, '');
export interface AiJob { id: string; status: 'reserved' | 'queued' | 'complete' | 'failed'; style: string; charged: number; error: string | null }
export interface AiRenderStyle { id: string; label: string }
export interface AiState { enabled: boolean; isPro: boolean; freeAvailable: boolean; styles: AiRenderStyle[]; latest: AiJob | null }
export interface PointPack { id: string; points: number; playProductId: string; priceCents: number }
export interface PointsState { balance: number; features: Record<string, { points: number }>; packs: PointPack[]; cardCheckout: boolean }

async function aiRequest<T>(path: string, body: unknown, read: (response: Response) => Promise<T>): Promise<T> {
  if (!BASE) throw new Error('AI rendering is not configured in this build.');
  const subject = useAuthStore.getState().account?.subject;
  if (!subject) throw new Error('Sign in to use AI rendering.');
  const token = await getGoogleIdToken();
  if (subject !== useAuthStore.getState().account?.subject) throw new Error('Account changed. Please reopen AI render.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
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
    if (subject !== useAuthStore.getState().account?.subject) throw new Error('Account changed. Please reopen AI render.');
    return value;
  } finally { clearTimeout(timer); }
}
export async function aiJson<T>(path: string, body?: unknown): Promise<T> { return aiRequest(path, body, response => response.json() as Promise<T>); }

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
  const result = await withTimeout(PlayBilling.purchase({
    productId: pack.playProductId,
    obfuscatedAccountId: await playAccountId(subject),
  }), PURCHASE_TIMEOUT_MS,
    'Purchase is still pending. Use Restore point purchases before buying again.');
  if (subject !== useAuthStore.getState().account?.subject) throw new Error('Account changed. Sign back in and restore point purchases.');
  if (!result.purchase) throw new Error('No completed purchase returned.');
  await claimPack(result.purchase);
}
export async function restorePlayPoints() {
  const subject = useAuthStore.getState().account?.subject;
  const { purchases } = await withTimeout(PlayBilling.getPurchases(), STORE_TIMEOUT_MS, 'Google Play did not respond.');
  for (const purchase of purchases) {
    if (subject !== useAuthStore.getState().account?.subject) throw new Error('Account changed. Please try again.');
    if (purchase.products.some(id => /^points_(2000|6000|15000)(_pro)?$/.test(id))) await claimPack(purchase);
  }
}
