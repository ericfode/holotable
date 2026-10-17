# Card animation language

This vocabulary began with twenty event compositions and now grows through the rounds in [the batch ledger](card-animation-batches.md). The table of those original twenty cards below remains their reference; later specifications record new identities and chosen examples. This is a visual contract for the Holotable viewer, not a second rules engine. A registered identity is accepted only after its completed board and independent visual review pass.

The executable vocabulary is [abilities.ts](../src/effects/abilities.ts). Recorded evidence comes from [outcomes.ts](../src/effects/outcomes.ts). Explicit demonstrations use [preview.ts](../src/effects/preview.ts) and the [staged board](../src/effects/showcase.ts). None of these changes the game state or the pinned engine.

The [reuse catalogue](card-animation-reuse.md) records existing shared code and candidate recipes for later refactoring, with concrete examples, required evidence and rule differences. Use it to recycle demonstrated mechanics without treating similar card text as proof of the same result.

## Read the effect through its consequences

Every scene should answer four questions: **who acted, what was affected, what changed, and where did it go?** A card may have a distinct cinematic signature, but the same game action must retain the same sign across cards.

Use a short anticipation, a legible action at the affected object, and a held result. Effects may be visually staggered for readability without claiming that simultaneous engine effects resolve in that visual order. In particular, Force Choke's damage and draw, and Make an Opening's stat loss and base healing, use simultaneous engine effects.

Numbers and trajectories must agree with the selected demonstration or recorded receipts. Damage is not defeat; healing is not maximum-HP gain; discarding from a hand is not milling a deck. A returned card travels intact to its specified destination. Defeat uses the actual destination: ordinary cards enter their owner’s discard, tokens cease, and deployed leaders return to their owner’s leader area exhausted. Board-wide effects must visibly cover both players and the stated arenas.

## Shared primitives

Color reinforces shape, movement, text, and destination. It is never the only distinction.

| Kind | Constant meaning | Visible sign |
| --- | --- | --- |
| `damage` | Damage markers increase on a unit or base | Orange-red directed hit, impact, explicit damage number |
| `defeat` | A unit or upgrade leaves play defeated | Removal with the actual discard, cessation or leader-area destination; no invented damage number |
| `heal` | Existing damage is removed | Green mending lines and heal number; unchanged maximum HP |
| `shield` | A Shield token is granted | Closed blue hexagonal shell settling into a token |
| `buff` | Power/HP increases, or Experience is granted | Green upward stat markers; count Experience tokens separately from phase bonuses |
| `debuff` | Power/maximum HP decreases temporarily | Violet downward stat markers with a phase duration |
| `draw` | Deck → that player's hand | Counted intact card moving into the hand fan |
| `discard` | Hand → owner's discard pile | One chosen/random-marked card leaving the hand for discard |
| `mill` | Deck top → discard | Counted deck cascade with no hand waypoint |
| `return` | Arena → owner's hand | Intact card retracts along a return arc; no death burst |
| `recover` | Discard → specified hand/deck destination | Cards emerge from discard; Restock visibly inserts at deck bottom |
| `resource` | A supported card becomes a resource | Exact origin and identity travel to a resource slot; show readiness only when known. Aggregate-only evidence changes the count without inventing a card |
| `ready` | Exhausted unit becomes ready | Teal upright rotation and relit action indicator |
| `exhaust` | Ready unit becomes exhausted | Amber sideways rotation and dimmed action indicator |
| `suppress` | Unit loses its abilities for the phase | Violet restraint striking through ability marks without changing stats |
| `attack` | A chosen unit performs an attack | Attacker lunge and exhaustion; damage/defeat shown only when separately supported |
| `cost` | Explicit conditional reduction of event or nested unit cost | Price ruler or badge decrements; distinguish the event payment from a nested play |
| `pay` | A chosen number of ready resources is spent | That number of resource cards exhausts and channels toward the effect |
| `inspect` | The declared hand, deck top or resources are examined | Reveal only faces authorized by the actual private/public visibility evidence |
| `play` | An actual card enters its arena from an explicit hand, deck, discard or resource origin | Intact entry to the measured ending slot, with supported cost and ready/exhausted pose |
| `control` | The same unit changes controller while retaining its owner | Cross to the destination side; show a pending return only when explicitly supplied |
| `search` | A specified portion of deck is searched or revealed under an explicit policy | Private/public shelf and selected-card gates; only selected public faces flip; separate movement receipts consume cards |
| `delay` | A supplied future consequence remains pending | A visible clock survives completion; a separately chosen boundary resolves it |
| `keyword` | A keyword is granted for its stated duration | A named pennant remains for a phase or expires with the actual attack |
| `restrict` | A unit cannot ready through the stated round | A persistent readiness lock, distinct from suppression or a future action |
| `rescue` | A card leaves a captured pocket for its observed arena | Actual pocket departure and owner arrival; rich rescued-entry semantics need explicit proof |
| `attach` | An upgrade changes host and/or controller without changing owner | Small attachment travels between measured hosts; stat contributions move once and owner/control stay distinct |
| `capture` | An arena unit becomes a card in a captor’s pocket | Intact cross-arena route into actual captive slots/count; no defeat or controllable-unit arrival |

The original twenty cards used nineteen kinds; A01–A05 extend the executable vocabulary to **28 kinds**. Availability of a kind does not establish acceptance of every scene using it. Traits and names such as Force, Tactic, Command, or Aggression are not interchangeable with mechanical outcomes. A Force card can suppress, deal damage, discount a cost, or grant tokens; its cinematic styling sits above those shared actions.

## Shared default: semantic action grammar

The shared JSON path chooses presentation from the **verified mechanical action and outcome**, rather than a card title, moral alignment, or which player benefits. Healing an opposing unit still restores; a friendly unit taking damage still receives an impact. The small mapping in `semanticMotion.ts` names roles across the existing vocabulary, while `semanticVocabulary.tsx` provides distinct reusable motion for impact, protection, restoration and enhancement.

| Role/action | Travel and formation | Arrival/held result |
| --- | --- | --- |
| Impact / damage | A pointed, segmented dart commits late and accelerates toward the actual recipient | Angular slashes and outward fragments; actual damage/HP receipts. No support shell or restorative stream |
| Protection / Shield | Paired contours assemble locally around the recipient, drawing closed from an open perimeter; no source projectile | A closed shell surrounds the same unit, with the actual Shield count/token preserved |
| Restoration / heal | Smooth curved strands gather inward from the recipient's periphery, with mending crosses; no directed shot | Mending seams settle while actual wounds decrease; maximum HP is unchanged |
| Enhancement / buff | Stepped chevrons rise beside the recipient | Actual power/HP changes occupy measured counters; no heal cross or Shield shell, and no inferred Experience token |
| Movement / draw, discard, mill, return, recover, play | Existing intact-card routes retain their real origin, destination and visibility; hidden moves use backs | Measured hand, deck, discard, resource or arena destination. A card is not struck simply because it changes zones |
| Control / controller changes | The same physical card crosses from its current controller to the measured destination controller | Owner, wounds and readiness remain distinct; a temporary return is shown only when explicitly supplied |
| Removal / defeat | Existing fracture/departure, with the actual discard or exhausted leader destination | No fabricated damage amount or default destination |
| Readiness / ready, exhaust | Existing upright/sideways pose and indicator | Actual readiness changes; no stat enhancement or restorative beam |
| Diminishment / debuff | Existing downward stat markers | Actual stat loss, separate from damage and healing |
| Resource | Existing observed placement, or a count-only marker when identity is missing | No invented face, origin or readiness for aggregate-only data |

This refines semantic primitives, not per-card registrations. Shared support effects no longer reuse a universal source-to-target energy beam. A quiet source acknowledgment may identify a known actor; explicit unit-origin or unknown-source outcomes retain local action without invented attribution. The same reversible clock owns every pose. Screen-pixel geometry and counter masks preserve silhouettes on tall mobile boards and clear measured base/neighbor counters. HTML result receipts and actual ending snapshots remain authoritative.

Only the four new semantic primitives suppress their former generic SVG visuals; they do not suppress the separately checked labels, numbers or final-state handoff. Existing attacks retain their established attacker-lunge/combat compositions and remain outside the shared event admission path: this change neither adds attack outcomes nor infers unsupported attack chronology. Other unsupported mechanics still report their fallbacks.

## Complete card grammar and staged choices

Every card name links to its read-only implementation in the pinned `forceteki` submodule. Card text and reprints were also checked against `forceteki/test/json/Card/<internal-name>.json`, which is installed card data rather than a committed source file.

| Card | Complete ability clauses | Explicit showcase example |
| --- | --- | --- |
| [Open Fire](../forceteki/server/game/cards/01_SOR/events/OpenFire.ts) | Choose a unit; deal **4 damage**. | Hit the enemy Wampa for 4. It survives on the staged board. |
| [Force Lightning](../forceteki/server/game/cards/01_SOR/events/ForceLightning.ts) | Choose a unit; **suppress all abilities this phase**. Then, **if you control a Force unit**, pay any number **N** of resources and deal **2N damage** to that same unit. | A friendly Force unit is present. Suppress the Wampa, pay 2, deal 4. Zero paid resources would produce no damage. |
| [Force Choke](../forceteki/server/game/cards/01_SOR/events/ForceChoke.ts) | **If you control a Force unit**, this event costs **1 less**. Choose a **non-Vehicle** unit; deal **5 damage**, and **that unit's controller draws 1 card**. | Friendly Force unit present; discount applies. Hit an enemy non-Vehicle for 5, defeating the staged Wampa; its controller draws 1. |
| [Takedown](../forceteki/server/game/cards/01_SOR/events/Takedown.ts) | Defeat a chosen unit with **5 or less remaining HP**. This can include a deployed leader. | Defeat the enemy Death Trooper, which has 3 HP remaining. |
| [Vanquish](../forceteki/server/game/cards/01_SOR/events/Vanquish.ts) | Defeat a chosen **non-leader** unit. | Defeat the enemy Death Trooper. |
| [Superlaser Blast](../forceteki/server/game/cards/01_SOR/events/SuperlaserBlast.ts) | **Defeat all units**, on both sides in both arenas. Bases and undeployed leaders are not units. | All six staged units are defeated: two ground and one space unit on each side. Neither base is hit. |
| [Overwhelming Barrage](../forceteki/server/game/cards/01_SOR/events/OverwhelmingBarrage.ts) | Give a **friendly unit +2/+2 this phase**. Then that unit deals damage equal to its resulting power, divided among any number of **other** units. Those recipients may be friendly or enemy; the source unit is excluded. | A 3-power Battlefield Marine becomes 5-power and deals 5 to one other unit. One recipient is a legal division of the damage. |
| [Bombing Run](../forceteki/server/game/cards/01_SOR/events/BombingRun.ts) | Choose **ground or space**; deal **3 damage to every unit in that arena**, including friendly units. | Ground chosen: four ground units take 3 each and three are defeated. Both space units remain untouched. |
| [Make an Opening](../forceteki/server/game/cards/01_SOR/events/MakeAnOpening.ts) | Give a chosen unit **−2/−2 this phase** and **heal 2 damage from your base**. The stat loss is not damage. | Weaken the enemy Wampa and mend the friendly base. |
| [Repair](../forceteki/server/game/cards/01_SOR/events/Repair.ts) | **Heal 3 damage** from a chosen **unit or base**, without a friendly-only restriction. | Remove 3 existing damage from the friendly base. |
| [Restock](../forceteki/server/game/cards/01_SOR/events/Restock.ts) | Choose **up to 4 cards from one discard pile**; put them on the **bottom of their owner's deck in random order**. Either player's pile is legal; piles cannot be mixed. | Four existing friendly discard cards return to the bottom of that player's deck. |
| [Resupply](../forceteki/server/game/cards/01_SOR/events/Resupply.ts) | Put **this event** into play as **one resource**, entering exhausted. | The event moves to the friendly resource row. |
| [Command](../forceteki/server/game/cards/01_SOR/events/Command.ts) | **Choose two, in either order:** (1) give **2 Experience** to any unit; (2) a **friendly unit deals its power** as damage to a **non-unique enemy unit**; (3) put this event into play as a resource; (4) return a **unit from your own discard pile to your hand**. | Choose **Experience + strike**: the Marine receives two Experience, then hits a non-unique enemy for its resulting 5 power. Resource and recovery modes are not shown. |
| [Vigilance](../forceteki/server/game/cards/01_SOR/events/Vigilance.ts) | **Choose two, in either order:** (1) mill **6** from an opponent's deck top; (2) heal **5** from **any base**; (3) defeat a unit with **3 or less remaining HP**; (4) give a unit **1 Shield**. | Choose **heal + Shield**: heal the friendly base for 5 and shield the Marine. No milling or defeat is claimed. |
| [Aggression](../forceteki/server/game/cards/01_SOR/events/Aggression.ts) | **Choose two, in either order:** (1) draw **1**; (2) defeat **up to 2 upgrades**, not their attached units; (3) ready a unit with **3 or less current power**; (4) deal **4 damage** to a unit. | Choose **ready + damage**: ready the exhausted 3-power Marine, then hit the enemy Wampa for 4. |
| [Cunning](../forceteki/server/game/cards/01_SOR/events/Cunning.ts) | **Choose two, in either order:** (1) return a **non-leader unit with 4 or less current power** to its owner's hand; (2) give a unit **+4/+0 this phase**; (3) exhaust **up to 2 units**; (4) an opponent discards **1 random card** from their hand. | Choose **return + exhaust**: return the 4-power enemy Wampa, then exhaust two different enemy units still in play. No random discard or stat buff is claimed. |
| [Power of the Dark Side](../forceteki/server/game/cards/01_SOR/events/PowerOfTheDarkSide.ts) | An **opponent chooses a unit they control**; defeat it. The event's controller does not choose that unit. | Mark the enemy Death Trooper as the opponent's selection, then defeat it. |
| [The Force Is With Me](../forceteki/server/game/cards/01_SOR/events/TheForceIsWithMe.ts) | Choose a **friendly unit**; give it **2 Experience**. **If you control a Force unit**, also give it **1 Shield**. You **may attack with that same unit**; it must be ready and have a legal attack. | Force unit present. The Marine gets two Experience and a Shield, then chooses to attack the enemy base for 5 and exhausts. The base does not counterattack, so the Shield remains. |
| [Waylay](../forceteki/server/game/cards/01_SOR/events/Waylay.ts) | Return a chosen **non-leader unit** to **its owner's hand**. | The enemy Wampa travels intact to the enemy hand. |
| [Spark of Rebellion](../forceteki/server/game/cards/01_SOR/events/SparkOfRebellion.ts) | **Look at an opponent's hand**, then **choose a card from it to discard**. This discard is chosen, unlike Cunning's random mode. | Open the enemy hand, mark one card, and move that card into discard. |

The conditional showcases include [Luke Skywalker, Jedi Knight](../forceteki/test/json/Card/luke-skywalker%23jedi-knight.json), `SOR_051`, whose card data includes the Force trait. A leader's name alone does not establish a Force unit in play.

Original SOR print identities remain the canonical art keys. Verified equivalent prints are Open Fire `TWI_174`, Vanquish `TWI_077`, Repair `JTL_075`, Resupply `TWI_127`, and Waylay `TWI_226`. A present but unknown print ID never falls back to a matching title.

## Data contracts and evidence boundaries

`cardAbilities(id)` returns the complete list of legal clauses. `cardAbilityRules(id)` marks the four modal cards with `choose: 2` and `order: 'any'`; `order: 'listed'` otherwise denotes the presentation order of the written clauses, not a claim that all effects resolve sequentially. Each modal clause has a stable `mode` identifier. `condition`, `optional`, and `duration` preserve limits that must not disappear in an animation.

`showcaseAbilities(id)` returns deliberate example choices. `showcaseLabel(id)` states those choices, including satisfied conditions. It must never be substituted for actual match evidence. A modal showcase shows exactly two selected modes, plus any explicitly staged consequences such as lethal damage defeating a unit.

`observedOutcomes(game, action)` compares the snapshot immediately before the action with its resolved snapshot. `detectCardEffects` attaches those receipts to the event cue. Instance IDs identify cards first. Older captures without IDs use a title/print only when the match is unique; ambiguous copies remain unassigned.

| Replay observation | Receipt allowed |
| --- | --- |
| Surviving unit/base gains damage markers | `damage` with the actual increase |
| Damage markers decrease | `heal` with the actual removed amount, capped by recorded damage |
| Board card appears in discard | `defeat`, including upgrades separately from their hosts |
| Board unit appears in a hand | `return`; never `defeat` |
| Discard card appears in a hand | `recover` to that hand |
| Non-source hand card appears in discard | `discard`; the played event's normal disposal is excluded |
| Unit stats change within the same phase | Net `buff` / `debuff`, with added Experience counted when present |
| New Shield upgrades appear | `shield` with the observed token count |
| Unit exhaustion changes within the same phase | `ready` / `exhaust`; regroup readiness is excluded |
| Resource total increases without identified resource cards | `resource` count only; no source-event identity or exhaustion guess |
| Known card appears in an explicit resource manifest | `resource` with its exact origin, identity and final readiness; avoid counting the aggregate gain twice |
| Known resource/discard card appears in an arena | Observed `play` route with final unit; no inferred free price, reveal order or entry trigger |
| Same upgrade changes host | `attach` with actual old/new host; owner/controller only when explicitly recorded |
| An arena unit appears in another unit’s captive list | `capture` with exact membership; no invented attack history |
| Captive appears in an arena | `rescue` route; missing owner/entry semantics remain unknown |
| Deployed leader disappears from arena and becomes an undeployed leader summary | `defeat` to `leader`, retaining actual exhaustion/deployment fields; never an invented discard |
| New hand cards plus deck loss on a card with a draw clause | Corroborated `draw` count |
| New discard cards plus deck loss on a card with a mill clause | Corroborated `mill` count |
| Restock discard departures plus corresponding deck growth | Corroborated `recover` to deck bottom |

Snapshots do not expose suppressed ability text or hand inspection, do not identify the conditional cost discount, and do not separate Force Lightning's extra payment from its ordinary play cost. A lethal target becomes a minimal discard reference, losing its final damage number. These omissions produce no invented numeric receipts. A vanished card without a known destination is not automatically called defeated. Recorded action spans can also contain triggered consequences, so a before/after receipt describes the observed change during the action rather than proving which internal engine effect caused it.

The `zone` on a receipt names the affected arena/base for stat and token changes, and the destination for movement: `hand`, `deck`, `discard`, `resources`, or `leader`; capture retains the captor’s arena plus explicit pocket membership. A live tail action waits until a later action or an end record confirms completion. Animation playback and seeking remain viewer policy.

## Animation framework decision

| Candidate | Relevant capability | Decision for this viewer |
| --- | --- | --- |
| Anime.js 4 | Timelines coordinate animations, timers, callbacks and labels; `seek(time, muteCallbacks)` positions the scene at an exact millisecond. React integration scopes effects and reverts them on cleanup. | Use one timeline for each card scene so the same sequence can play normally or be sampled for frame review. [Timeline](https://animejs.com/documentation/timeline/), [seek](https://animejs.com/documentation/timeline/timeline-methods/seek/), [React integration](https://animejs.com/documentation/getting-started/using-with-react/) |
| Motion `useAnimate` | Manual timeline controls, component-scoped DOM/SVG selection, and automatic cleanup. | A viable alternative; retain existing Motion for surrounding viewer UI while card sequences share a single Anime.js timeline model. [Official documentation](https://motion.dev/docs/react-use-animate) |
| PixiJS 8 filters | Scene post-processing including blur, color transforms, displacement, noise, and custom shaders. | Our assessment: useful for a future particle-heavy canvas scene, but unnecessary for this card/zone choreography. Keep the current DOM board and SVG overlay. [Official documentation](https://pixijs.com/8.x/guides/components/filters) |

The framework does not supply meaning. Target anchoring, a visible number, a correct destination, and a held result are authored by the effect scene. Glow and particles support those signs.

## Verification and frame review

The focused suite is `npm test`. It checks registered staged examples, recorded identities and unknowns, actual before/after state, legal payment, ownership/control, phase and incarnation prerequisites, explicit movement destinations and incomplete-evidence fallbacks. New kinds require targeted assertions for their meaningful failure cases. Exact per-round results and available real recording checks belong in the batch ledger.

Visual acceptance requires 18%, 46%, 72% and 90% frames, a 100% final board, and the overlay-free ending after natural playback. The ordinary board must retain every result after the overlay disappears. Independently inspect ordered desktop/mobile pixels and live timing, then check replay/reset, backward seeking, cancellation and reduced motion. The current [animation skill](../skills/swu-card-animation/SKILL.md) defines score thresholds, frozen-build evidence and effort decisions. Preserve failed first-pass evidence; tests, registration and a build alone do not establish acceptance.

## Live seat-view outcomes

Live duels use the same checked outcome vocabulary. A visible hand play retains its known source and physical route. When a seat cannot see the source, `observedLiveChanges` uses only consecutive public snapshots in the same action phase and round. It keeps source/selected target unknown and shows checked damage, healing, tokens, stat changes, movement, control and removal locally. Combat consequences do not imply a reconstructed attacker or attack chronology.

A body first revealed in an arena gets a local entry fade at its measured ending slot. The `observed` entry requires one unique physical ID in the ending and no occurrence in the prior public snapshot; it supplies no hand/deck origin or payment. Duplicate IDs and contradictory print/name receipts are rejected. Routine draws, discards, resourcing and readiness alone stay quiet on this fallback; the known-source path can still explain supported versions. Unsupported changes settle directly to the real board.

`test/fixtures/live-duel-events.json` contains a small capture from Arena's real `createOpenHost({mode: 'people'})` producer (seed 0, both seats), covering an opponent's previously hidden entry and combat damage/removal. It is a UI transport regression receipt, not a rules oracle. The live prompt keeps its response heading and move picker fixed while its details scroll, and disables choices during animation handoff.
