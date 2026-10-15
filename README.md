# Holotable

The Star Wars Unlimited replay and tournament viewer of the SWU Arena project, and the viewer kit other pages embed.
It reads recorded games (`replays/<id>/index.json` and `games/<id>.jsonl`, written by the arena's `bot/tournament.js`
and `bot/recorder.js`; format in [docs/replay-format.md](docs/replay-format.md)) and opens deep links like
`#/t/<tournament>/g/<game>?step=300`. It never runs the rules engine: every step of a replay carries its own board.

Stack: Vite + React 19 + TypeScript, Tailwind CSS v4, Motion (board transitions), Anime.js (card choreography), Recharts,
cmdk (command palette), Zustand, Lucide icons.

Holotable moved here, with its history, from the arena repo (`ericfode/swu_bot`, `studio/`). The arena still writes the
replays and owns the replay format; changes to the format start there.

## Setup

Node 22 (`.nvmrc`). The engine, `forceteki`, is a git submodule pinned at the arena's engine (`2ebed8ca2`,
`https://github.com/ericfode/forceteki`). The viewer itself never loads it; the card-effect tests read its card data
(`forceteki/test/json`) and a few of its card specs, and the animation docs link to its card implementations.

```bash
git clone --recurse-submodules https://github.com/ericfode/holotable.git
cd holotable
npm ci
npm run cards        # card data for the tests: installs forceteki's runtime dependencies and runs its get-cards
npm test
```

A clone made without `--recurse-submodules` needs `git submodule update --init` (`--depth 1` is enough). `npm run cards` downloads the
official card data from a live API (about a minute), so it is not content-pinned by the submodule; it writes only
ignored files inside `forceteki/` (its `node_modules/` and `test/json/`). Never edit tracked files in `forceteki/`.

## Commands

```bash
npm run dev                  # http://localhost:5190, serving ./replays itself (no second server)
npm run cards                # card data into forceteki/test/json (once per engine pin; the tests need it)
npm test                     # card-effect, sound and token tests (node --test test/*.test.cjs; needs the card data)
npm run typecheck            # app and scripts
npm run build                # production build -> dist/ (npm run preview serves it with the same routes)
npm run build:kit            # the viewer kit -> dist-kit/swu-viewer-kit.js (IIFE, global SWUViewer) and .mjs
npm run build:static         # one self-contained HTML page with fixture or real games baked in -> dist-static/
npm run fixtures             # two hand-made tournaments in the replay format -> fixtures/replays/
npm run check:lens -- ...    # lens file checks (see scripts/check-lens.ts)
```

### Data the dev server serves

Every path has a default inside this repo (gitignored) and an environment variable:

| Variable | Default | What |
|---|---|---|
| `REPLAYS_DIR` | `replays/` | tournaments: `GET /api/tournaments`, `/replays/*`. Point it at the arena's, e.g. `REPLAYS_DIR=../swu_bot/replays npm run dev`. |
| `EVALS_DIR` | `evals/` | position evaluations, `/evals/<gameId>.json` |
| `LENS_DIR` | `lens/` | lens files (scores), `/lens/<gameId>.json`, `/lens/<dir>/<gameId>.json`, `/lens/evaluators.json` |
| `CARD_TEXT` | `/mnt/project-files/viewer-kit/card-text.json` when it exists | printed card data at `/card-text.json`; `CARD_TEXT=` turns it off |
| `TABLE_URL` | `http://127.0.0.1:8790` | the table play mode talks to (`/table/api`, the arena's `bot/table/serve.js`) |
| `ATLAS_KIT` | `/mnt/project-files/meta/kit/atlas-kit.js` | the Strategy Atlas kit, built into the app and the kit (Atlas spots). It belongs to the arena (`meta/atlas-kit.js`); with no file the build warns and draws no spots. |

### Without real games

```bash
npm run fixtures                                   # -> fixtures/replays/
REPLAYS_DIR=$PWD/fixtures/replays npm run dev
npm run build:static                               # one self-contained HTML file with the fixtures baked in -> dist-static/
STATIC_REPLAYS=../swu_bot/replays npm run build:static   # same, with real tournaments instead (colon-separate several folders)
STATIC_EVALS=… STATIC_LENS=… npm run build:static  # also bake in evaluations and lens files (one <gameId>.json each; STATIC_LENS subfolders and evaluators.json too)
STATIC_DATA=files STATIC_REPLAYS=… npm run build:static  # keep the data out of the page: staged in static-data/data/ to publish beside it
```

Both static builds also stage the printed card data (`CARD_TEXT`, same default as above) as `card-text.json`, cut down
to the cards in the staged games (~240 KB for the 18 real games): baked into the page, or `data/card-text.json` with
`STATIC_DATA=files`.

A single-file page has to stay under 16 MB, which holds about 28 games. With `STATIC_DATA=files` the page is ~1 MB and
fetches `data/manifest.json`, `data/<tournament>/…` and `data/_evals|_lens/<gameId>.json` relative to itself when
opened, so a preview can carry over a hundred games. Pair it with an art pack (`scripts/art-pack.py`, split into parts
when big) published as `art-pack.json` beside the page.

## The viewer kit

`npm run build:kit` builds `src/kit/index.tsx` into one self-contained bundle (React and styles included, rendered into
a shadow root): `dist-kit/swu-viewer-kit.js` (global `SWUViewer`) and `dist-kit/swu-viewer-kit.mjs`.

```html
<div id="game"></div>
<script src="swu-viewer-kit.js"></script>
<script>const v = SWUViewer.mount(document.getElementById('game'), { url: 'games/x.jsonl', evals, lens }); v.seek(120);</script>
```

It also exports `mountBoard`, `mountGlyph`, `mountActionIcon`, `scoreSeries`, `scoreAt`, `pivotal`, `loadCardText`,
`loadArtPack`, `setArtResolver` and more (see `src/kit/index.tsx`). `node scripts/kit-demo.mjs <game.jsonl>` writes a
one-file demo page next to the bundle.

Who embeds it:

- **The arena** (`ericfode/swu_bot`): the SWU Arena app (`app/build.mjs` inlines `swu-viewer-kit.js`) and the arena
  window (`bot/arena/window.js` serves it; `ARENA_KIT` names the file). Its Docker image builds the kit today from its
  own `studio/` copy; it should build it from this repo instead, with `ATLAS_KIT` pointing at its `meta/atlas-kit.js`.
- **Holocron** (`ericfode/holocron`, the bots): the Karabast live view (`karabast/live-view.js --kit <dir>`), the
  analysis report (`lab/analysis/report.js --kit`) and the meta page (`lab/meta/build-page.js`). They take a built
  kit file, by default the shared copy in `/mnt/project-files/viewer-kit/`.
- **The shared project folder**: `/mnt/project-files/viewer-kit/` holds the published build (`swu-viewer-kit.js`,
  `.mjs`) and the printed card data (`card-text.json`). Refresh it from a `build:kit` of this repo.

## What's in it

- **Play mode** (`#/play`, also in the navigation): a person plays a bot on the replay board, drawn from their seat (the
  bot's hand face down). Every legal move is a glowing card, a button in the prompt bar under the board, or an entry
  in **All moves**; damage splits get a stepper per target, long menus (name a card) a search box. The game runs at a
  table, the arena's `bot/table/serve.js`, which seats the person as one more protocol v2 client and checks every
  answer again, so the person sees only their seat and a slip never loses the game. The dev server sends `/table/api`
  to `TABLE_URL` (default `http://127.0.0.1:8790`); `serve.js --site dist` serves a built Holotable and the table from
  one address. Code: `src/pages/PlayPage.tsx`, `src/play/` (messages, client, which cards can be clicked).
- **Card effects** (`#/effects`, also in the navigation): a growing catalogue of bespoke animations. Select a card, replay it, or play the collection on a clearly labeled staged board. Modal examples name their choices; shared ability filters and a visual legend explain the mechanics. The [batch ledger](docs/card-animation-batches.md) distinguishes authored scenes from independently accepted examples and the remaining imported catalogue.
- **Frame inspection**: the slider and Anticipation / Impact / Outcome / Settle buttons pause the same Anime.js timeline used in playback. **Final board** shows the persistent result with no overlay. Deep-link with `#/effects?card=superlaser-blast&progress=46` (percent). Change of Heart and Sneak Attack also have a separately selectable **Regroup begins** example (`&stage=regroup-start`); playing their immediate scene does not advance to regroup automatically. Examples declare targets, prerequisites, payments, and before/after snapshots independently of recorded games.
- **Sound effects**: enable Sound in the showcase or replay viewer, then adjust the volume. Twenty original procedural scores combine card signatures with shared ability sounds. Web Audio starts only from the enable gesture; muting, scrubbing, changing cues, leaving the page, and hiding the tab cancel the active sound. Held inspection frames are silent. Sound starts off for each viewer session. See [the sound language](docs/card-sound-language.md).
- **Effects in replays**: the same renderer runs when a supported event's recorded action resolves during forward playback or single stepping. The Effects toggle disables it; Replay effect repeats the current supported action. Playback leaves time for the effect to finish. Backward navigation and large timeline jumps do not animate intervening actions. Reduced motion shows a static caption. Exact targets follow recorded card IDs when available; missing or ambiguous targets fall back to the seat region. The rules engine and recorded state are unchanged.

- **Tournaments**: standings with Elo (K=24, sequential in play order), recent form, the Elo race over the tournament, a head-to-head heat map, first-seat win rate, and a filterable game list. Indexes with running games refresh every 2 s.
- **Replay**: the table laid out as in SWU (ground arena, base and leader, space arena per seat), units animated in and out, damage and healing pop-ups, base HP rings, the initiative token sliding between seats, exhausted cards turned, hidden hands per perspective.
- **Momentum timeline**: base HP, board power, hand size and the chosen score (from player 1's side) for every decision, with round bands; position evaluations add four P(p1 wins) curves. A score with a fitted or its own chance is drawn on the 0-100% axis; a rough or uncalibrated one is dashed on its own axis. Click or drag it to seek.
- **Scores** (`src/data/score.ts`): each lens file is one score (swu-lens/1, format in `/mnt/project-files/omni/LENS.md` plus `/mnt/project-files/viewer-kit/LENS-proposal.md`). The viewer reads its label, unit, chance, weights per step and parts from the file, never from built-in constants; the only built-in score is Omni v1 (`src/data/omniV1.ts`), used for old omni files and, estimated from the board, for games with no file. Files live at `lens/<gameId>.json` (the default path) and `lens/<dir>/<gameId>.json`, listed in `lens/evaluators.json`. With two or more for a game a **Score** picker appears (`?score=<dir>` deep links one; the pick is saved), and the board, chips, breakdown, inspector, timeline and swings all follow the chosen score.
- **Card values** (header button, a card with a value chip): every card's value in the chosen score drawn on the card, with the search's verdicts on the boards it searched. On by default when the score has a file for the game. Each part of the score has one colour and icon (`src/data/terms.ts`, `components/TermIcon.tsx`) used on the cards, the totals, the legend and the breakdown, so a number leads to its row. The **Board score** tab breaks the step into those parts with their rules; the **Weights** tab lists the weights in force.
- **Atlas spots** (`src/data/atlas.ts`, `components/Spots.tsx`): the Strategy Atlas's game situations (Board behind, Near death, Lethal range, ...) that hold for each seat at the current step, as chips by its base (the spot's icon and name, coloured When behind red, Close or long grey, When ahead blue; hover for the rule), and one lane per seat under the timeline with bars where each group holds and a mark at each round start where a spot begins (ringed where the Atlas counts the game in that spot; click to jump). The rules, words, icons and colours all come from the Atlas kit (the arena's `meta/atlas-kit.js`, built in through `vite.atlas.ts` from `ATLAS_KIT`; a page that loads its own `window.AtlasKit` wins). Each seat is read from its own side, so one seat's Board behind is the other's Board ahead. The kit's `spots: false` hides them.
- **Card inspector**: the hovered card at a readable size in the side panel, or next to the pointer when there is no side panel. Leader fronts and bases are drawn landscape.
- **Card text** (`src/lib/cardText.ts`, `components/CardFace.tsx`): with printed card data loaded (`card-text.json`, `swu-card-text/1` from `viewer-kit/make-card-text.py`, keyed by set code like a replay card's `s`), a card with no image (Vector, missing art, a failed image, an unreleased set) is drawn in the inspector as a readable text face: name, subtitle, cost, aspect pips, type, arena and traits, rules text (triggers bold, `[costs]` boxed, reminder text dim), a leader's epic action and deployed side, printed power/HP, upgrade bonus or base HP; the type size steps down until the text fits. Tiles take their real aspect colours (Vigilance blue, Command green, Aggression rust red, Cunning yellow, Heroism off-white, Villainy black; several aspects split across the diagonal), shaded away from the seat colours and the score violet. Without the data, cards keep the monogram tiles in muted per-name tones. The app asks its data source for it (`/card-text.json` from the dev/preview server, `card-text.json` in a static build); the kit takes `cardText` in mount options or `SWUViewer.loadCardText(url | object)`.
- **Tokens**: units with no set code (the recorder writes `s: null` for tokens: Battle Droid, Clone Trooper, X-Wing, Mandalorian, Beast, Spy…) carry a TOKEN tag on the card; token upgrades (Shield, Experience, Advantage, Weakness) are the light `t: 1` chips.
- **Decision log** grouped by round, with what each decision changed (units entering or defeated, base damage, resources).
- Keyboard: ← → step, shift for 10, `[` `]` (or ↑ ↓) jump a round, space play, Home/End, ⌘K / Ctrl+K command palette.
- Live games (no end record yet) are re-read every second; the view follows the newest move until you scrub away.

## Layout

- `src/data/` — format types (`types.ts`, from [docs/replay-format.md](docs/replay-format.md)), loading (`source.ts`, `staticSource.ts`), derived metrics and unit tracking (`derive.ts`), standings (`stats.ts`), action classes (`actions.ts`), evaluations (`evals.ts`), lens files and scores (`lensFile.ts` reads a file, `score.ts` resolves a score over a game, `calibrate.ts` chance maps, `terms.ts` rows, `omniV1.ts` the built-in Omni v1).
- `src/components/` — `Board`, `Card`, `CardZoom` (inspector and floating zoom), `Momentum`, `Log`, `Shell` (nav and command palette).
- `src/kit/` — the embeddable viewer (`GameViewer`) and the `SWUViewer` bundle (`npm run build:kit`).
- `src/effects/` — verified card catalogue, ability grammar, observed replay outcomes, Anime.js timeline, SVG primitives and card choreography, and staged showcase data. `npm test` checks identity, replay detection, outcomes, and example semantics. See [the animation language](docs/card-animation-language.md).
- `src/pages/` — home, tournament, game and effects pages.
- `test/` — `node --test` suites; they load the TypeScript sources with `typescript5` (TypeScript 5.6.3 under an alias, for `transpileModule`) and read card data from `forceteki/test/json/Card`.
- `scripts/` — capture, replay-verification, audio and card-inventory tools for the animation work, the lens check, the kit demo and the art pack.
- `fixtures/` — the hand-made tournaments (`generate.mjs`), static-build staging (`stage.mjs`) and lens test cases (`lens-cases/make.mjs`).
- `docs/` — the replay format and its JSON schemas, the card animation and sound languages, the batch ledger and the per-batch specs and reviews.
- `skills/swu-card-animation/` (and `.agents/skills/` for Codex) — the animation authoring and review workflow.
- `vite.atlas.ts` — `virtual:atlas-kit`: the Atlas kit (`ATLAS_KIT`) as a module, without touching `window.AtlasKit`; no file means no spots.
- `vite.config.ts` — includes a small plugin that serves `/api/tournaments` and `/replays/*` as [docs/replay-format.md](docs/replay-format.md) describes.
- `forceteki/` — the engine submodule, read only.

## Visual review captures

With the showcase running and Playwright available, `node scripts/capture-effects.mjs` captures four animation frames, an overlay-free final board, natural playback completion, full pages, and contact sheets into gitignored `results/card-effects-review`. It checks held-frame stability and natural/held final-state equality, and fingerprints source files with the evidence. Use `--help` for browser/module paths, output directory, card selection, viewport, stage, and URL overrides. Capture success is not visual acceptance; inspect the images against the card rules and record independent scores through the [animation skill](skills/swu-card-animation/SKILL.md).

`node scripts/verify-effect-replays.mjs --cards search-your-feelings,the-emperors-legion` checks existing recorded plays against their authoritative before/after snapshots, then verifies Replay and backward seeking. The served production build must match current source. Use `--help` to select the tournament, recordings directory, output receipt, and installed browser. Cards without a recording are reported separately; the command never starts new games.

`node scripts/render-effect-audio.mjs --help` documents offline WAV export and browser audio checks. Generated audition files and peak/RMS measurements go into gitignored `results/card-effects-audio`; the product synthesizes its sound locally and needs no audio assets or service credentials.

`node scripts/card-animation-inventory.cjs` writes the planned animation inventory and batches from the card data
(`--scope imported`, the default). `--scope bot --arena ../swu_bot` limits it to the cards the arena's bots can play,
using the arena's `Env` (its engine must be built).
