# UI improvement report for the next Claude pass

Date: 2026-08-08
Status: first three priorities implemented; remaining guidance retained below
Evidence: current source, `CHANGELOG.md`, `.ai/WIP_CURRENT.md`, tester feedback, and a read-only Lazyweb reference-search trial

## Executive recommendation

Do not redesign the editor wholesale. The app already has several of the right patterns: Room/Type catalogue browsing, search, favourites, recents, real thumbnails, opt-in 3D previews, a visible **Finish room** affordance, one-shot furniture placement, a mobile delete button, contextual Pro copy, three web plans, Restore purchase, and purchase timeout recovery.

The next UI pass should concentrate on three smaller gaps:

1. Turn the single mobile delete button into a compact, context-aware selection dock.
2. Make catalogue search and category navigation work well as the cloud catalogue grows.
3. Make choosing a Pro plan a deliberate selection followed by one clear purchase action.

These changes improve common paths without reopening geometry, rendering, authentication, entitlement, model-loading or catalogue-preview work that is already functioning.

## Implementation progress

- **P0 contextual mobile selection dock — implemented 2026-08-08.** The old
  automatic Properties opening was replaced by the dock, which exposes
  furniture rotate/duplicate, stair reverse, door hinge/swing, undo-capable
  delete and More. Full validation is green.
- **P0 catalogue search and navigation — implemented 2026-08-08.** Search now
  normalizes aliases, punctuation, accents and basic plurals across reviewed
  local and validated cloud terms. The catalogue shows result counts and
  recovery actions without creating arbitrary categories.
- **P1 safer Pro plan selection — implemented 2026-08-08.** Plan cards select
  without purchasing; one explicit CTA starts checkout. Exact RevenueCat price
  data drives truthful yearly comparisons, while lifetime and renewal wording
  remain distinct and Restore remains independent.
- **Validation:** typecheck, lint, production build, catalogue geometry tests
  and the complete 108-check non-3D browser regression suite pass with zero
  page errors.
- **Next:** P1 completion/placement feedback, then P2 preview metadata.

## What the Lazyweb trial actually showed

| Query | Coverage | Useful finding | Limitation |
|---|---:|---|---|
| `mobile furniture catalog` | Moderate, top similarity 0.533 | Strong retail apps expose a shallow category hierarchy, persistent search and predictable global navigation. | Results were primarily retail catalogues, not floor-planning editors. |
| `mobile 3D editor controls` | Moderate, top similarity 0.457 | Editors expose only actions relevant to the selected object in a reachable bottom toolbar. | Matches were mostly video/AR editors; treat this as a general interaction pattern, not domain evidence. |
| `subscription paywall lifetime` | Strong, top similarity 0.662 | The clearest paywalls compare plans, emphasise annual value, label lifetime as one payment, show renewal terms and retain Restore. | Examples came from other consumer categories, so their pricing and urgency tactics should not be copied. |

Representative products returned included Farfetch/Costco for category browsing, Videoleap/Lightroom for contextual editing controls, and LockWidget/NYT/LA Times for plan presentation. The results support interaction patterns, not visual imitation.

## P0 — contextual mobile selection dock

### Problem

On coarse-pointer devices, `App.tsx` currently adds only `.mobile-selection-delete` when an object is selected. Common actions remain inside the Edit/Properties sheet. That forces extra sheet opens for operations testers repeatedly need: rotate, flip a door or stair, lock, duplicate, change elevation, and delete.

### Proposed behaviour

Replace the floating bin with a bottom selection dock positioned above `.mobile-tabs`:

- Furniture: **Rotate 90°**, **Duplicate**, **Lock/Unlock**, **Delete**.
- Door/window: **Flip hinge**, **Flip swing**, **Delete**, **More**.
- Stair: the two existing direction/flip actions, **Delete**, **More**.
- Wall/room: only safe high-frequency actions; keep dimensions, materials and destructive structural edits in Properties.
- **More** opens the existing Properties sheet. Do not duplicate every property in the dock.

Use the existing store mutations and `PropertiesPanel.tsx` actions rather than creating a second transformation system. Keep controls at least 44px, show text with icons where space permits, respect safe-area insets, and never cover the floor switcher or zoom controls.

### Interaction details

- The dock appears after selection and disappears on deselection, drawing, walkthrough mode or modal opening.
- Delete remains one tap, followed by the existing undo path/toast rather than a confirmation dialog.
- Rotation and flip actions update in place and preserve selection.
- Haptics should use the existing feedback helper, not a new plugin.
- Desktop keeps the current Properties panel; this is a phone reachability improvement.

### Likely files

- `src/App.tsx`
- `src/index.css`
- `src/components/PropertiesPanel.tsx` for extracting/reusing action definitions
- `src/store/designStore.ts` only if a required mutation is not already exposed
- locale dictionaries for any new visible labels
- `tests/smoke.mjs`

### Acceptance checks

- Selecting each supported object kind renders only valid actions.
- Door hinge/swing and stair direction can be changed without opening Edit.
- Rotate/duplicate/delete are reachable with one thumb and leave no accidental placement mode armed.
- Dock does not overlap Android navigation, `.mobile-tabs`, zoom or floor controls at 360px width.
- Keyboard/desktop behaviour is unchanged.

## P0 — catalogue search that scales beyond the current inventory

### Problem

`CatalogSidebar.tsx` currently searches translated name, category and broad catalogue group. It cannot match common aliases or intent such as `television`, `media cabinet`, `wall mounted`, `bedside table`, `night stand`, `outdoor chair` or misspellings. This becomes more visible as cloud models grow.

### Proposed behaviour

Add a small, controlled search vocabulary rather than fuzzy-searching every manifest field:

- Optional `searchTerms`/`tags` on bundled and approved remote catalogue entries.
- Normalise case, accents, punctuation, singular/plural and whitespace.
- Search name, translated name, room category, type group, placement (`floor`, `surface`, `wall`) and approved aliases.
- Show a lightweight result count and retain the last Room/Type choice while the sheet remains mounted.
- If there are no results, offer two useful actions: clear filters and switch Room/Type. Do not silently manufacture a category.

Remote terms must use the same allowlist/schema discipline as categories. Do not accept arbitrary HTML or use server-provided strings as translation keys.

### Category navigation refinement

Keep the current Room/Type toggle, favourites, recents and lazy card rendering. On phones, make the filter row sticky within the sheet and consider a compact category grid/list with item counts when `All` contains too many horizontal chips. This is an evolution of the current hierarchy, not a new catalogue.

### Likely files

- `src/components/CatalogSidebar.tsx`
- `src/data/furnitureCatalog.ts`
- `src/lib/remoteCatalog.ts`
- remote catalogue manifest schema/Worker validation if tags are cloud-delivered
- `src/index.css`
- `tests/smoke.mjs`

### Acceptance checks

- `tv`, `television`, `media unit` and `wall mounted tv` return the intended existing entries.
- Room/Type, category, favourites and recents still behave exactly as before.
- Unknown cloud categories remain rejected.
- Search/filter changes create no WebGL canvas and do not import Three.js.
- Large result sets scroll smoothly on a representative Android phone.

## P1 — safer, clearer Pro plan selection

### Problem

The web paywall already has monthly, yearly and lifetime cards, highlights yearly, lists benefits and exposes Restore. However, each plan card currently starts checkout immediately. That makes plan comparison less deliberate and gives the user no stable final CTA before a potentially slow external purchase flow.

### Proposed behaviour

- Tapping a plan selects it; it does not purchase immediately.
- A single full-width CTA below the cards reads, for example, **Continue with yearly — €39.99/year**.
- Default to yearly only when that package is genuinely available; never substitute a different package silently.
- Show monthly equivalent and truthful savings on yearly when prices permit calculation.
- Label lifetime **One-time payment** and never describe it as a subscription.
- Place concise renewal/cancellation wording immediately below the CTA.
- Keep **Restore purchase** visible and independent of the selected plan.
- While checkout is busy, identify the selected plan and retain the existing timeout/reconciliation behaviour. Do not add another spinner-only state.

Android should show only packages actually returned by Google Play/RevenueCat. Web and Android can share presentation logic, but must not assume identical offerings or currencies.

### Preserve

- Feature-triggered hero copy in `ProUpsellModal.tsx`.
- The exact `Pro` entitlement and Google-linked identity model.
- The 90-second purchase watchdog and actionable Restore recovery.
- RevenueCat as purchase/entitlement authority; no local Pro shortcut.

### Likely files

- `src/components/ProUpsellModal.tsx`
- `src/index.css`
- `src/store/proStore.ts`
- `src/lib/pro.ts`
- locale dictionaries
- purchase-related smoke coverage

### Acceptance checks

- First tap selects a plan; only the CTA initiates checkout.
- The CTA always names the same package and price sent to RevenueCat.
- Lifetime is never shown with renewal language.
- Yearly savings disappear rather than becoming misleading when package data is incomplete.
- Restore works with no plan selected.
- Failed, cancelled and timed-out purchases always leave the modal usable.

## P1 — reinforce completion and placement state

The requested room-completion fix is already present: drawing exposes **Finish room**, explains tapping the first point, highlights the closing point and supports Enter/double-click. Do not build another room workflow unless a current-version device test reproduces a failure.

The one-shot furniture placement fix is also present. A small follow-up could make the transition clearer:

- After placement, show a short `Placed <name>` message with **Undo** and optional **Place another**.
- Keep the new item selected and show the selection dock.
- Never re-arm placement unless **Place another** is explicitly chosen.
- While placement is armed, keep the existing instruction pill and add an obvious Cancel action if it is not already visible at the tested viewport.

This should reuse the existing toast/undo and pending-furniture state; avoid introducing a second placement state machine.

## P2 — catalogue preview metadata

The current static preview plus opt-in **View in 3D** boundary is important for phone performance and must remain. Improve the information around it rather than making previews eager:

- Add a small placement badge: **Floor**, **Wall** or **Place on furniture**.
- Keep dimensions visible and use the active unit preference where practical.
- Mark Free/Pro consistently beside the name instead of relying only on a lock overlay in the grid.
- For a wall/surface item, give one sentence describing its snap behaviour before placement.

Do not mount a 3D canvas per card, preload all GLBs, or replace lazy-decoded thumbnails with live renders.

## Explicit non-goals for this pass

- No editor-wide visual redesign.
- No new rendering pipeline, post-processing or WebGL contexts.
- No geometry, staircase, room-detection or walkthrough rewrite.
- No new entitlement source or direct Stripe/Play integration around RevenueCat.
- No removal of Room/Type, favourites, recents, thumbnails or on-demand preview.
- No Lazyweb screenshot upload or generated redesign without a separate owner decision.

## Recommended implementation order

1. Contextual mobile selection dock, with focused phone smoke tests.
2. Catalogue aliases/tags and sticky navigation, preserving zero-WebGL browsing.
3. Two-step Pro plan selection and truthful price comparison.
4. Placement confirmation and preview metadata only after the first three are stable.

Each item should be independently releasable. Measure phone layout and interaction cost after each step; do not combine all four into one high-risk UI branch.
