# ⚡ KanFlash

A local kanban board for your projects, editable by you (in the browser) and by your project's AI (through a CLI).
Everything lives in a single `board.json` file: no database, no external service.

- **Web UI**: columns, drag & drop for cards and columns, card descriptions and checklists, search. Styled after Windows 7 Aero glass.
- **CLI**: `kanflash add`, `move`, `done`, `check`… so an AI agent can read and update the board while it works.
- **Drops into any project** as a hidden folder that never reaches the project's remote.
- **Live sync**: the page updates by itself when the board file changes, and the other way around.

## Install into a project

From the root of your project (Node 18+ required):

```bash
npx degit Felipe-Gomes-Amorim/KanFlash .kanflash
node .kanflash/scripts/setup.js
```

`setup`:

- installs dependencies and builds the site;
- hides `.kanflash/` from the project's git using `.git/info/exclude` (a **local** rule, nothing is pushed to the project's remote);
- writes instructions for the AI to `CLAUDE.local.md` (also hidden), so it reviews the board before working and updates it afterwards;
- adds a `SessionStart` hook to `.claude/settings.local.json` so Claude Code sees the board as soon as a session opens.

Options: `--file AGENTS.md` (another instructions file, e.g. for Codex or Cursor), `--shared` (write to the tracked `AGENTS.md`/`CLAUDE.md` instead), `--no-hook`, `--no-build`.

No `degit`? `git clone --depth 1 https://github.com/Felipe-Gomes-Amorim/KanFlash .kanflash && rm -rf .kanflash/.git` does the same.

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

Each project gets its own `data/board.json`. To keep the board somewhere else, set `KANFLASH_BOARD=/path/to/board.json`.

## Development

```bash
npm install
npm run build && npm start     # production build on :4545
npm run dev                    # Vite with hot reload (run the server in another terminal)
```

## License

[MIT](LICENSE)
