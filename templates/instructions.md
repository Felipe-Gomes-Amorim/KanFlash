## KanFlash: this project's kanban board

`{{CLI}}` manages the project's board. The user also edits it in the browser, so read it, never trust memory.

1. **Before work**: `{{CLI}} list` (or `next` if no task was named). Reuse a matching card; otherwise `add "title" --priority should --check "step"`.
2. **Start**: `start <id>` (moves to the 2nd column). If the column is full (WIP limit), finish something first; never use `--force` unless told to.
3. **During**: `check <id> <item#>` right after each step; new work becomes `add` / `add-item`.
4. **Finish**: `done <id>`. If incomplete, leave it in progress and note what is left in `edit <id> --desc`.

Priorities (MoSCoW): `must`, `should`, `could`, `wont`. Never change one the user set. Don't delete cards the user made. Never edit `board.json` by hand.

Other commands: `show <id>`, `move <id> <col>`, `edit <id> --title/--desc/--priority`, `rm <id>`, `uncheck`, `rm-item`, `list --all`, `col-add|col-rename|col-rm|col-move|col-limit`. Run `{{CLI}} help` for details.
