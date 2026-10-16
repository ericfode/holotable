# Shared JSON card animation default

Holotable now defaults to shared, JSON-derived presentation. `animationResolver.ts` owns precedence: an exact-print entry in `CARD_ANIMATION_OVERRIDES` selects a bespoke signature; every other card uses the shared planner. Existing `CARD_EFFECTS` entries remain staged examples and optional legacy comparisons, rather than implicit overrides. Of those 180 examples, 175 now use the shared default and five retain deliberate signatures: Superlaser Blast, Force Lightning, Sneak Attack, Change of Heart and Final Showdown. Each override records its exact prints and reason; registration rejects unknown signatures, mismatched prints, duplicate prints and empty reasons.

This continues `a0c5321` on Holotable `0e3cff6`. The historical 285-card branch at `43a5d9a` was inspected, not restored over newer upstream work. No Kessel engine source, runtime admission, replay schema or owner checkout was changed.

## Provenance and coverage

The committed v2 presentation index comes from Kessel `compiler/generated/catalog.json` at `573385d06f2de36c5a92756b65ef3746389a5bc2`, schema `swu-card-ir/v1`, SHA-256 `8e1471ac07b23758e7f3b3767a93c117e146adfd086e5d910dd4c2d5fd670ccd`. Exact print identities, presentation programs, source/data hashes, compiler status and provenance are retained. Converted/compiler-supported does not mean executable or runtime-admitted.

| Coverage category | All definitions | Event definitions |
| --- | ---: | ---: |
| Routed through default resolver | 2,458 (2,549 prints) | 442 |
| At least one recognized recipe | 2,029 | 255 |
| Recognized shape with no unsupported markers | 952 | 145 |
| Recognized recipe plus unsupported constructs | 1,077 | 110 |
| No recognized recipe | 429 | 187 |

These are **routing and static presentation-shape counts**, not accepted card scenes or full visual/rules coverage. Intrinsic physical entry adds the `play` recipe for units/leaders, so a card can have an entry animation while its abilities remain unsupported. Runtime evidence can still reject any mapped receipt. An unknown-only definition can show independently verified local changes, explicitly labelled `observed-only:<kind>`. The prior strict direct-event slice was 37 definitions / 49 prints / seven families; it remains tested but no longer gates default routing.

## Exact mapped constructs

The importer recognizes the following effect leaves, without evaluating target expressions or amounts:

| Kessel effect kind | Shared visual family |
| --- | --- |
| `damage`, `heal`, `defeat`, `ready`, `exhaust` | Corresponding local effect |
| `returnToHand`, `returnToHandSystem` | Return |
| `resourceCard`, `resourceCardSystem` | Resource |
| `modifyStats` | Buff/debuff from observed stat deltas |
| `giveShield` | Shield count increase |
| `giveExperience` | Observed stat change; no inferred Experience cause |
| `draw` | Count-only deck → hand backs |
| `discardHandSystem`, `discardSpecificCard` | Verified hand/resource → discard |
| `discardDeckSystem` | Count-only deck → discard backs |
| `moveDeckCards` | Verified discard → hand/deck recovery |
| `playCardSystem`, intrinsic unit/leader entry | Physical arena entry |
| `takeControl` | Physical control change (supported adapter; absent as a direct kind in this pinned catalogue) |

Fifteen families occur in the generated catalogue; the runtime also supports verified control movement. Structured wrappers retained include `simultaneous.effects`, `sequence.effects`, `conditional.onTrue/onFalse`, `select.effect`, static `chooseModalEffects.choices[].effect`, explicit `resolveChoice` entries, `namedSelectCardSystem.innerSystem`, `systemPropertiesFactory.effect`, ability `then`/`ifYouDo`/`ifYouDoNot`, optional/conditional ability metadata and scoped continuation bodies. Unknown fields on leaves, wrappers, choice entries and continuations produce explicit diagnostics; empty/dynamic groups are unsupported.

The tree is a presentation index, **not an executed choreography or rules program**. The runtime composes verified net outcomes concurrently on the established clock. It does not select modal branches, infer prerequisites, order effects from static sequences, evaluate amount expressions, infer payment or enact future boundaries. `fullyMappedShape` therefore does not mean full chronological/card-clause fidelity. A later chronology adapter needs actual ordered event receipts.

## Required recorded evidence

`structured.ts` validates every receipt against the supplied before/after snapshots. Physical IDs are checked across arenas, hands, discard, resources, full known-deck manifests, attachments, captives, bases and undeployed leaders. A deployed leader summary is an alias, not a second physical object. A checked outcome never mutates the recorded ending.

- Damage/heal require matching actual positive damage-marker deltas on a continuing recipient, or the same base. Minimal discard references cannot prove lethal damage amount.
- Ready/exhaust require the actual continuing readiness transition. Buff/debuff require the actual stat deltas. Shield requires an actual token-count increase, with uniqueness/prior-history checks for explicit token IDs.
- Return/defeat/recovery/resource/play/control require unique physical origins and destinations. Ownership and controller are separate. Recovery into a known deck does not infer bottom positioning. Entry uses actual ending body/readiness and the measured ending layout, without claiming cost/trigger legality.
- Draw/mill require new distinct destination IDs and corroborating deck decreases; compound receipts share the available deck decrease. Duplicate/wrong-seat prior deck identities are rejected. Backs convey counts, not hidden faces.
- Aggregate resource gain supports a count-only receipt. It identifies neither a card, its origin, nor readiness.
- Source beams need one matching physical source and canonical exact-print identity. Explicit `sourceCard` origins suppress the event beam and retain local effects, rather than inventing unit-origin geometry. Separately observed event disposal masks its old hand face without claiming payment.

Fallbacks are inspectable in `cue.structured.fallbacks` and `data-effect-fallbacks`; the caption uses readable summaries. Examples: `unsupported-json:<kind>`, `unsupported-definition`, `insufficient-physical-evidence:<kind>`, `insufficient-source-evidence`, `aggregate-only:resource`, `observed-only:<kind>`, `no-resolved-outcomes`. Missing details leave the supplied ending authoritative.

Unsupported richer mechanics include attacks and attack protocols; distributed damage/healing; searches/private reveals; attachment and capture transitions; token creation/cessation; Advantage/Weakness; keyword/permission/suppression changes; costs/discounts/Force/credits; granted abilities; private/dynamic system factories; delayed effects and trigger boundaries. Some yield verified generic net changes, but no claim about their unresolved mechanics. Full unsupported counts are in the generated index. Ordinary attacks retain the existing attack renderer.

## Automatic composition demonstration

`test/fixtures/structured-compositions.cjs` supplies three explicitly synthetic recorded-format examples, with real printed identities, costs, available aspects and actual before/after changes:

| Previously unregistered definition | JSON structure | Actual shared result |
| --- | --- | --- |
| Maim, HMW_207 | `sequence`: damage + exhaust | 1 damage and the same Wampa exhausted |
| Perseverance, ASH_089 | `simultaneous`: heal + Shield | 3 wounds healed and one Shield on the same Wampa |
| Grassroots Resistance, SEC_258 | `simultaneous`: select/damage + own-base heal | 3 damage to Wampa; own base heals 3 |

These names/IDs occur only in test/demo fixtures, not production card-specific switches or the override registry. All three enter through the ordinary HTTP replay reader → classifier → detector → registered `GameViewer`, with nullable selected targets. All outcomes are composed from observed changes; Maim's static sequence does not establish an event chronology. The fixture is not an engine recording or engine validation.

## Integration, review and scaling

`GameViewer` and the registered Effects page both use the resolver. The Effects page offers **Animation: Default / Shared recipes only / Legacy composition** for review; default URLs need no `recipes=1` flag. For example `/#/effects?card=repair&progress=46`; add `&renderer=legacy` for the prior signature. Legacy signatures remain available for deliberate future overrides and comparison.

Rendering reuses `EnergyBeam`, `OutcomeVisual`, `ZoneTravel`, `AttachmentMask`, `ScreenPixels`, established ability colors, measured endpoints and the single reversible Anime.js clock. No new gameplay state machine, animation timer or per-card rendering branch is introduced. Shared entry/control adds a measured card-face route using those primitives.

Verification for this pass: 689 JS/state tests; 27 focused structured tests; typecheck, production build and embeddable-kit build. Registered UI regression: 10 cases in 57.209s (Repair/Waylay/Vanquish desktop, Waylay/Open Fire mobile, reduced motion, nullable-target replay and leader defeat), including interruption, backseek, repeated playback and exact natural/final handoff. New compositions: four cases in 12.843s (three desktop plus Perseverance at 390×844), 18/46/72/90% and natural completion, nullable target, backseek and idempotent repeat. Frozen captures use the browser clock initialized before module load; the separate short preview uses normal real-time playback. Independent pixel review caught old unitHP/wound chips beneath new proofs; shared numeric facts now replace the measured counters at resolution and restore them on backward seek/cancellation. Logs preserve failed harness attempts (late clock installation, a past pause time, and offscreen mobile page crops); final evidence uses full board captures. Optional missing `card-text.json` 404s remain reported; no page errors.

Evidence and independent visual scores are in the sibling `evidence/` delivery directory. Coverage of every definition, every branch, all older signatures under the new default, other browsers and real Kessel recordings is not claimed. The generated index increases the production bundle; it is currently eager. A future split can load presentation metadata separately without changing precedence.

Regenerate/check, then validate a representative slice:

```sh
node scripts/import-kessel-animations.mjs /path/to/catalog.json 573385d06f2de36c5a92756b65ef3746389a5bc2 --check
npm test
npm run typecheck
npm run build
npm run build:kit
node scripts/verify-structured-default.mjs --url http://127.0.0.1:5198 --out /path/to/evidence --playwright /path/to/installed/playwright --browser /path/to/installed/chromium
node scripts/verify-structured-animations.mjs --url http://127.0.0.1:5198 --out /path/to/regression --playwright /path/to/installed/playwright --browser /path/to/installed/chromium
```

Scaling requires adding one effect-shape mapping and evidence adapter per mechanical family, plus representative compound tests/pixels. A newly imported definition with existing shapes automatically takes the shared path. Add an exact-print override only when reviewed bespoke choreography adds meaning the shared net-outcome presentation cannot convey. Future chronological composition must bind real ordered event outcomes, not manufacture target/branch/order decisions from static JSON.
