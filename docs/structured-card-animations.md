# Structured card animation pilot

This adds a reusable presentation path for Kessel card JSON while keeping current authored signatures first in the runtime registry. It is based on Holotable `origin/main` at `0e3cff6` (180 signatures). The historical 285-card branch at `43a5d9a` was inspected but not restored over newer upstream work. No engine source, replay schema, runtime admission, or owner checkout was changed.

## Data and coverage

The committed index is generated from Kessel `compiler/generated/catalog.json` at `573385d06f2de36c5a92756b65ef3746389a5bc2`, schema `swu-card-ir/v1`. Its SHA-256 is `8e1471ac07b23758e7f3b3767a93c117e146adfd086e5d910dd4c2d5fd670ccd`; the supplied working file was also compared with `git show` at that revision. The index retains exact print identities, the compiled ability/target constraints, source/data hashes and compiler provenance. No network or Kessel checkout is needed by the viewer.

| Shared recipe | Candidate definitions |
| --- | ---: |
| Damage | 5 |
| Heal | 3 |
| Defeat | 14 |
| Return to hand | 4 |
| Ready | 4 |
| Exhaust | 5 |
| Resource | 2 |
| **Total** | **37 definitions / 49 exact prints** |

These are eligible static shapes, not 37 fully accepted card scenes or executable engine cards. Of 2,458 definitions, 2,016 are non-events. Of 442 events, 37 map and 405 are excluded by the strict first-pass grammar. The generated index reports every exclusion by reason: compound abilities (164), simultaneous effects (44), attacks (26), conditional effects (20), sequences (19), stat modifiers (17), multiple/missing abilities (16), search (11), and other unsupported/dynamic forms. A supported compiler status does not establish runtime admission.

## Presentation boundary

`scripts/import-kessel-animations.mjs` derives a recipe from one direct event ability. Unknown fields, compound/optional branches, extra costs, unsupported effect kinds and dynamic damage/heal amounts fail closed. Target predicates and printed amounts remain descriptive metadata; Holotable never evaluates them as game rules.

`structured.ts` matches each receipt against explicit before/after snapshots. It checks physical IDs across arenas, hands, discard, resources, known deck manifests, attached upgrades and captives. A deployed leader's summary is an alias of its arena body. Numeric displays use actual final cards; the comparison preview does not apply damage or healing twice. Routes use the observed controller origin and destination seat. A leader departure goes to its supplied exhausted leader summary, never to an inferred discard. Unknown disappearance/token cessation does not become defeat.

An absent or ambiguous source suppresses directed beams and reports a fallback while preserving independently supported local receipts. Event disposal is a separately observed hand-to-discard change, rendered with a measured source fade and local discard marker. It does not establish payment or a discount.

The planner leaves the supplied ending snapshot authoritative even when a receipt cannot be animated. Diagnostic reasons are exposed in `cue.structured.fallbacks`, the overlay's `data-effect-fallbacks`, and the caption. Examples:

- `unsupported-definition`: modal Command has no direct shared recipe.
- `insufficient-physical-evidence:resource`: the existing Resupply example has aggregate resources, without an exact physical resource manifest; no card flight/readiness is invented.
- `insufficient-source-evidence`: a missing, duplicated or conflicting source gets no directed attribution.
- `unmapped-receipt:<kind>` / `no-resolved-outcomes`: unsupported collateral or absent outcomes stay unclaimed.

Attachments, token creation/cessation, payment, attack protocols, hidden selections, modal/conditional resolution and later boundaries need additional evidence adapters. Even a statically mapped definition can fall back for these forms. The shared path is a conservative first pass, not a rules legality checker or a replacement for card-specific choreography.

## Runtime and preview

`detectCardEffects` automatically uses the new path for exact mapped prints without an authored signature. Existing signatures keep precedence. The registered showcase also provides **Shared JSON recipes** to compare established staged examples with the shared renderer:

```text
/#/effects?card=repair&progress=46&recipes=1
/#/effects?card=waylay&progress=72&recipes=1
/#/effects?card=vanquish&recipes=1
```

The shared renderer reuses `EnergyBeam`, `OutcomeVisual`, `ZoneTravel`, `AttachmentMask`, `ScreenPixels`, the established ability colors, measured ending layout, and the existing single Anime.js clock. It adds no card-specific render switch and no new timer/state engine. Replay, cancellation, backseek and final handoff continue through `GameViewer`. The generated JSON is included in capture source fingerprints.

Regenerate or verify the index:

```sh
node scripts/import-kessel-animations.mjs /path/to/catalog.json 573385d06f2de36c5a92756b65ef3746389a5bc2
node scripts/import-kessel-animations.mjs /path/to/catalog.json 573385d06f2de36c5a92756b65ef3746389a5bc2 --check
```

## Verification and limits

The focused test file exercises importer rejection, exact print lookup, registration precedence, sparse/null targets, duplicate/missing physical IDs (including attachments/captives/deck), source ambiguity, real deltas versus static amounts, owner-hand routes, leader aliases, unsupported modal/resource forms, readiness and disposal. Its fixture is explicitly synthetic and does not claim an engine recording or engine validation.

The reusable UI runner uses the production routes and public controls, plus an explicitly labelled synthetic HTTP replay. It checks:

- Repair, Waylay and Vanquish at 1440×1250; Waylay and Open Fire at 390×844.
- 18%, 46%, 72%, 90%, then natural completion; expected identity, progress and fallback state before captures.
- Final board, backseek to before, natural completion equal to the explicit final state, repeated playback, and interrupted Repair → Waylay selection.
- Reduced-motion completion; an unregistered print through HTTP reader → classifier → detector → registered viewer, with a nullable classified target; physical deployed-leader transition back to the exhausted leader area.
- No page errors or stale floating hover inspector; loaded art and capture hashes are recorded. Optional missing `card-text.json` is reported separately.

```sh
npm test
npm run typecheck
npm run build
npm run build:kit
npm run preview -- --host 127.0.0.1 --port 5198
node scripts/verify-structured-animations.mjs --url http://127.0.0.1:5198 \
  --out /path/to/evidence --playwright /path/to/installed/playwright \
  --browser /path/to/installed/chromium
```

Independent review inspected the 25 ordered/natural sample images. Readability / meaning / impact: Repair desktop **4/5/3**, Waylay desktop/mobile **4/5/3**, Vanquish desktop **4/5/4**, Open Fire mobile **4/4/3**. No new per-card signature acceptance count is claimed. Remaining polish: the inherited mobile Open Fire shockwave stretches over neighboring art; its target, damage amount and held HP remain legible. Live pacing was observed by the author and recorded in a short preview, but was not independently scored. Other browsers, every mapped card/print, and real Kessel match recordings were not exhaustively reviewed.

To scale, add effect-shape recognition and evidence adapters one family at a time, retaining exact physical outcomes and explicit unsupported diagnostics. Reuse the renderer and lifecycle, then validate a representative visual slice. Compound choices need chosen branch/causality receipts before composition; compiler support alone must never select or execute them.
