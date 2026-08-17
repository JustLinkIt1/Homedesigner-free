// Deciding whether a RevenueCat customer holds Pro, separated from the fetching
// so it can be tested against real response shapes.
//
// It lives in its own file because the bug it exists to prevent was invisible
// under every test we had: `revenueCatEntitled()` compared the wrong field to
// the wrong kind of identifier, and the only check covering it asserted the
// exact broken expression as a string. A source-text assertion cannot tell a
// correct comparison from an incorrect one — it can only tell that nobody
// edited the line. Handing a realistic payload to a pure function can.

/** One entry of `GET /v2/.../customers/{id}/active_entitlements`. */
export interface ActiveEntitlementItem {
  /**
   * The entitlement OBJECT id — `entlf6de9c6c3d`, the value in the dashboard
   * URL — and NOT the lookup key (`Pro`) that every RevenueCat SDK reports as
   * the entitlement identifier. The field name reads like the latter, which is
   * exactly how the two got confused.
   */
  entitlement_id?: string;
  /** Epoch ms, or `null` for a grant that never expires. */
  expires_at?: number | null;
}

/** One entry of `GET /v2/projects/{id}/entitlements`. */
export interface CatalogueEntitlement {
  id?: string;
  lookup_key?: string;
}

/** The identifier the SDKs use, and the one `hasProEntitlement()` matches in
 *  the client. The REST API never returns it in `active_entitlements`. */
export const PRO_ENTITLEMENT_LOOKUP_KEY = 'Pro';

/** Object id of the entitlement whose lookup key is `Pro`, in project
 *  `proja88f8624`. Overridable through `REVENUECAT_PRO_ENTITLEMENT_ID`,
 *  because it is the one half of the pairing that changes if the entitlement is
 *  ever recreated — and a stale value here locks paying customers out of
 *  Android, which has no other entitlement source. */
export const PRO_ENTITLEMENT_ID = 'entlf6de9c6c3d';

/**
 * A grant with no expiry is reported as `expires_at: null`. A MISSING field is
 * treated the same way rather than as expired: read the other way, a field
 * RevenueCat simply stopped sending would revoke every lifetime unlock at once.
 * Erring toward keeping a buyer unlocked is the same call made throughout the
 * billing code.
 */
export function entitlementLive(item: ActiveEntitlementItem, now: number): boolean {
  if (item.expires_at === null || item.expires_at === undefined) return true;
  return typeof item.expires_at === 'number' && item.expires_at > now;
}

/** Live entitlements only, so expiry is decided once and the id matching below
 *  never has to think about time. */
export function liveEntitlements(
  items: ActiveEntitlementItem[] | undefined,
  now: number,
): ActiveEntitlementItem[] {
  return (items ?? []).filter((item) => entitlementLive(item, now));
}

/**
 * Whether this entry is our Pro entitlement.
 *
 * Accepts the lookup key as well as the object id. That costs nothing and
 * covers a v1-shaped payload or a future API revision that starts returning
 * lookup keys — the failure being guarded against is a matcher that recognises
 * only ONE of the two names RevenueCat gives the same entitlement.
 */
export function matchesProEntitlement(item: ActiveEntitlementItem, configuredId: string): boolean {
  return item.entitlement_id === configuredId
    || item.entitlement_id === PRO_ENTITLEMENT_LOOKUP_KEY;
}

/** Object ids in the project catalogue carrying the Pro lookup key. Used only
 *  when the configured id fails to match, to recover from a recreated
 *  entitlement rather than silently reporting a paying customer as free. */
export function proIdsFromCatalogue(items: CatalogueEntitlement[] | undefined): Set<string> {
  const ids = new Set<string>();
  for (const item of items ?? []) {
    if (item.lookup_key === PRO_ENTITLEMENT_LOOKUP_KEY && typeof item.id === 'string') {
      ids.add(item.id);
    }
  }
  return ids;
}
