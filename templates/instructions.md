## KanFlash: this project's kanban board

This project has a local kanban board (KanFlash). It is the source of truth for what is being worked on. The user also edits it in the browser, so **always read the current state instead of relying on memory**.

Command (run from the project root): `{{CLI}}`

### Required workflow

1. **Before starting any task**: run `{{CLI}} list` and read the cards.
   - If a card already exists for what you are about to do, use it (`show <id>` for its description and checklist).
   - If not, create one: `{{CLI}} add "title" --col "To do" --desc "context" --check "step 1" --check "step 2"`.
2. **When you start**: `{{CLI}} start <id>` (moves it to the 2nd column, e.g. "In progress").
3. **While working**: check off checklist items as soon as you finish them (`check <id> <item#>`). If you discover new work, create cards or items (`add`, `add-item`).
4. **When you finish**: `{{CLI}} done <id>` (moves it to the last column) and update the description if something relevant changed. If the work is incomplete, leave the card in progress and note what is left.
5. Outdated or duplicate cards can be edited (`edit`) or removed (`rm`). Do not delete cards the user created without a clear reason.

### Commands

```
list [--col <column>] [--json]      show <id>
add "title" [--col c] [--desc d] [--check item]...
move <id> <column> [--pos n]        start <id>      done <id>
edit <id> [--title t] [--desc d]    rm <id>
check|uncheck <id> <item#|text>     add-item <id> "text"     rm-item <id> <item#>
col-add "name"   col-rename <col> "new"   col-rm <col>   col-move <col> <pos>
```

`<id>` accepts `3` or `#3`. `<column>` accepts a name or an id. Never edit `board.json` by hand; always use the command.
