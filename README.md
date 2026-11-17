<img width="2012" height="782" alt="kanflash-banner" src="https://github.com/user-attachments/assets/e7c25445-8e3d-4575-94ab-a7a5d12bed03" />




# KanFlash

A local kanban board for your projects, editable by you (in the browser) and by your project's AI (through a CLI).
Everything lives in a single `board.json` file: no database, no external service.

## What it does

### For you

- **Board in the browser**: columns, drag & drop for cards and columns (cards float under the mouse while you drag), descriptions, checklists with progress bars, search. Styled after Windows 7 Aero glass with a game-UI feel.
- **Light agile, no team needed**: MoSCoW priorities on cards (must / should / could / won't), work-in-progress limits on columns, and `kanflash next` to pick the right card.
- **Your own wallpaper**: pick an image and crop it (screen, 16:9, 21:9, 4:3 or free ratio).
- **Live sync**: the page updates by itself when the AI changes the board, and the other way around.
- **Invisible to the project**: lives in a hidden `.kanflash/` folder that never reaches the project's remote, about 0.5 MB on disk, no `node_modules`.

### For your AI

- **Reads the board before working**: a session-start hook prints the board, and a one-line reminder keeps it in mind (sent when it changes, otherwise every 5th message).
- **Updates it as it goes**: `start`, `check`, `done`, `add`, `edit`, `move`... through a CLI with short outputs.
- **Picks what to do next**: `kanflash next` returns the highest-priority card in the first column, so you never have to answer "what's next?" again.
- **Respects your limits**: it refuses to move a card into a full column (WIP limit) unless it is told to force it.
- **Gets nudged when it forgets**: if a card is still in progress and the board was not touched during a turn, a `Stop` hook asks the AI once to update it (never loops, optional with `--no-stop`).
- **Any AI that reads an instructions file**: Claude Code gets hooks; for Codex, Cursor and others use `--file AGENTS.md`.

## Token savings

A board is memory the AI does not have to rebuild. Without one, every "what's next?" makes the AI reread git history and files; with one, it reads about 100 tokens.

The cost of KanFlash itself is small and measured from the real output sizes:

| Item | Size |
| --- | --- |
| AI instructions (once per session) | ~260 tokens |
| Board at session start (`list`) | ~60-150 tokens (the last column shows only its 3 newest cards) |
| Per-message reminder | ~40 tokens, and only when it changes or every 5th message |
| A typical task (`list`, `start`, a few `check`, `done`) | ~600 tokens |

Estimated total for a small project (120 messages, 25 tasks, 10 sessions), median of 20,000 simulated runs:

| How you work | Tokens | With KanFlash |
| --- | --- | --- |
| 1. Forget the next step, ask the AI every time | ~201k | **-63%** |
| 2. Review the next step with the AI every 5 messages | ~185k | **-60%** |
| 3. Never ask, no board | ~178k | **-58%** |
| 4. Use KanFlash and never ask | **~73k** | |

KanFlash itself costs about 38k of those 73k (roughly 320 tokens per message). The rest of the saving comes from cheaper "what's next?" answers (scenarios 1 and 2) and from less rework when the AI knows what is done and what is a priority (scenario 3).

**These are estimates, not measurements.** The KanFlash overhead is solid, but the benefits rest on assumptions: that rebuilding the project state without a board costs about 4k tokens (range 2k-9k), and that the AI goes in the wrong direction on about 25% of tasks without a board and about 6% with one. If the question costs less than ~1.5k tokens, scenario 1 breaks even, and in a tiny or one-session project the fixed overhead may not pay off. You can change every assumption in [`docs/cost-model.py`](docs/cost-model.py) and rerun it, or compare the `/cost` of the same task in a project with and without KanFlash.

## Install into a project

From the root of your project (Node 18+ required):

```bash
npx degit Felipe-Gomes-Amorim/KanFlash .kanflash
node .kanflash/scripts/setup.js
```

`setup`:

- uses the prebuilt site in `dist/` (no `npm install`, no `node_modules`: about 0.5 MB on disk);
- hides `.kanflash/` from the project's git using `.git/info/exclude` (a **local** rule, nothing is pushed to the project's remote);
- writes instructions for the AI to `CLAUDE.local.md` (also hidden), so it reviews the board before working and updates it afterwards;
- adds three Claude Code hooks to `.claude/settings.local.json`: `SessionStart` (shows the board), `UserPromptSubmit` (a one-line reminder with the card in progress and the next one, about 40 tokens; sent when that changes and otherwise every 5th message) and `Stop` (nudges once if a card is still in progress and the board was not touched during the turn).

Options: `--file AGENTS.md` (another instructions file, e.g. for Codex or Cursor), `--shared` (write to the tracked `AGENTS.md`/`CLAUDE.md` instead), `--no-hook` (no hooks at all), `--no-stop` (skip only the `Stop` nudge), `--build` (force a rebuild).

No `degit`? `git clone --depth 1 https://github.com/Felipe-Gomes-Amorim/KanFlash .kanflash && rm -rf .kanflash/.git` does the same.

## Update

```bash
node .kanflash/bin/kanflash.js update
```

This downloads the latest version over the installed one and refreshes the AI instructions. Your board (`data/board.json`) and background are kept. Restart the server afterwards if it was running.

## Use

```bash
node .kanflash/bin/kanflash.js serve --open     # opens the UI at http://localhost:4545
node .kanflash/bin/kanflash.js list             # show the board in the terminal
node .kanflash/bin/kanflash.js help             # every command
```

## How it works

| Part | Where | What it does |
| --- | --- | --- |
| Data | `data/board.json` | columns, cards, descriptions, checklists; a `rev` field prevents overwriting concurrent changes |
| Core | `core/board.js` | all the operations; used by both the CLI and the server |
| CLI | `bin/kanflash.js` | the interface for the AI (and for you) |
| Server | `server/server.js` | serves the site, the API and real-time events |
| UI | `app/` (React + Vite) | drag cards and columns, descriptions, checklists |
| Instructions | `templates/instructions.md` | the rules your project's AI follows |

Each project gets its own `data/board.json` (and `data/background.jpg` if you set a background). To keep the board somewhere else, set `KANFLASH_BOARD=/path/to/board.json`.

## Development

```bash
npm install
npm run build                  # dist/ is committed: rebuild and commit it after UI changes
npm start                      # serve on :4545
npm run dev                    # Vite with hot reload (run the server in another terminal)
```

## License

[MIT](LICENSE)
