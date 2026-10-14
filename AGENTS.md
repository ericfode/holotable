# Working on Holotable

Read `CLAUDE.md` for what the repository is, its commands and its constraints; it
applies to Codex work too. `README.md` has the setup and the data the viewer serves.

- Use Node 22 (`.nvmrc`). Clone with `--recurse-submodules` (or run
  `git submodule update --init`), then `npm ci`, then `npm run cards` once per
  engine pin to download the card data the tests read into `forceteki/test/json`.
- Checks: `npm test`, `npm run typecheck`, `npm run build` and `npm run build:kit`.
  CI runs the same four on pull requests.
- Never edit tracked files in `forceteki/` (the pinned engine submodule). Its
  dependency install and card download are ordinary setup, not engine edits.
- The card animation workflow is `.agents/skills/swu-card-animation/SKILL.md`
  (the same as `skills/swu-card-animation/SKILL.md`; keep the two in step).
- Basic development needs no service credentials. Keep tokens and `.env` files
  out of Git.
