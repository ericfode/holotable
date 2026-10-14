# CLAUDE.md

Guidance for Claude Code sessions in this repository.

## What this repo is

Holotable: the Star Wars Unlimited replay and tournament viewer of the SWU Arena project (Vite + React 19 + TypeScript),
and the viewer kit (`SWUViewer`, built from `src/kit/`) that the arena app, the arena window and Holocron's pages embed.
It moved here with its history from the arena repo (`ericfode/swu_bot`, `studio/`). It reads recorded games and never
runs the rules engine. `README.md` has setup, commands, the data the dev server serves, and who embeds the kit.

- The replay format is `docs/replay-format.md` (schemas in `docs/schemas/`), mirrored from the arena's
  `spec/replay-format.md`. The arena writes replays and owns the format: a format change starts there.
- Card animations and sounds: `src/effects/`, `docs/card-animation-*.md`, `docs/card-sound-*.md`, and the workflow in
  `skills/swu-card-animation/SKILL.md` (`.agents/skills/` holds Codex's copy; keep the two in step).
- `forceteki/` is a **git submodule** of `ericfode/forceteki` at the arena's engine pin (`2ebed8ca2`). Tests read its
  card data (`forceteki/test/json`, from `npm run cards`) and a few of its card specs; docs link to its card
  implementations. **Never modify anything inside `forceteki/`.** Moving the pin means updating the submodule commit
  here, ideally in step with the arena.

## Commands

```bash
npm ci
npm run cards        # once per engine pin: card data into forceteki/test/json (needs the submodule checked out)
npm test             # node --test test/*.test.cjs
npm run typecheck
npm run build
npm run build:kit    # dist-kit/swu-viewer-kit.js and .mjs
npm run dev          # http://localhost:5190; REPLAYS_DIR, EVALS_DIR, LENS_DIR, CARD_TEXT, ATLAS_KIT override the data
```

CI (`.github/workflows/ci.yml`) runs the same checks on pushes to main and on pull requests. The repo is private, so CI
spends paid minutes: keep the workflow lean and do not add triggers or matrix jobs without asking.

## Rules

- Do not skip, disable or delete tests to get a green run.
- No model names or model identifiers in commits, PR descriptions or files, beyond the attribution lines the session
  asks for.
- Keep tokens, keys and `.env` files out of git.
- Generated output (`dist*`, `.check/`, `static-*`, `fixtures/replays/`, `results/`, local `replays/`, `evals/`,
  `lens/`) is gitignored; do not commit it.
