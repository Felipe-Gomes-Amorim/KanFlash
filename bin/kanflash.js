#!/usr/bin/env node
// KanFlash CLI. Built to be used by people and by the project's AI alike.
import {
  loadBoard, saveBoard, findCard, findColumn,
  addCard, moveCard, editCard, removeCard,
  addItem, setItemDone, removeItem,
  addColumn, renameColumn, removeColumn, moveColumn, setColumnLimit, nextCard,
  PRIORITY_LABEL, BOARD_FILE,
} from '../core/board.js';

const HELP = `KanFlash - a kanban board for you and your AI

Read
  kanflash list [--col <column>] [--json]     show the board
  kanflash show <id> [--json]                 show one card in full
  kanflash next                               the card to pick up next (highest priority in the 1st column)

Cards
  kanflash add "title" [--col <column>] [--desc "text"] [--check "item"]... [--priority <p>]
  kanflash move <id> <column> [--pos <n>] [--force]   (pos starts at 1)
  kanflash start <id> [--force]               move to the 2nd column
  kanflash done <id>                          move to the last column
  kanflash edit <id> [--title "new"] [--desc "new"] [--priority <p>|none]
  kanflash rm <id>

Checklist
  kanflash check <id> <item#|text>
  kanflash uncheck <id> <item#|text>
  kanflash add-item <id> "text"
  kanflash rm-item <id> <item#|text>

Columns
  kanflash col-add "name" [--limit <n>]
  kanflash col-limit <column> <n|none>        work-in-progress limit (moves into a full column are refused)
  kanflash col-rename <column> "new name"
  kanflash col-rm <column>                    (only if empty)
  kanflash col-move <column> <pos>            (pos starts at 1)

Server
  kanflash serve [--port 4545] [--open]       open the web UI

<id> accepts "3" or "#3". <column> accepts the column name or id.
<p> is a MoSCoW priority: must, should, could or wont. Put flags after the other arguments.
Data file: ${BOARD_FILE}`;

function parse(argv) {
  const pos = [];
  const flags = {};
  const multi = new Set(['check']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      const isBool = next === undefined || next.startsWith('--');
      const val = isBool ? true : next;
      if (!isBool) i++;
      if (multi.has(key)) (flags[key] ||= []).push(val);
      else flags[key] = val;
    } else pos.push(a);
  }
  return { pos, flags };
}

function cardLine(c) {
  const total = c.checklist.length;
  const done = c.checklist.filter((i) => i.done).length;
  const prio = c.priority ? ` (${PRIORITY_LABEL[c.priority]})` : '';
  return `#${c.id}${prio} ${c.title}${total ? `  [${done}/${total}]` : ''}${c.description ? '  …' : ''}`;
}

function printBoard(board, only) {
  console.log(`# ${board.name}`);
  const cols = only ? [findColumn(board, only)] : board.columns;
  for (const col of cols) {
    const limit = col.wip ? `/${col.wip}${col.cards.length > col.wip ? ', over the limit' : ''}` : '';
    console.log(`\n## ${col.title} (${col.cards.length}${limit})`);
    if (!col.cards.length) console.log('  (empty)');
    for (const c of col.cards) console.log('  ' + cardLine(c));
  }
}

function printCard(card, col) {
  console.log(`#${card.id} ${card.title}`);
  console.log(`Column: ${col.title}`);
  console.log(`Priority: ${card.priority ? PRIORITY_LABEL[card.priority] : '(none)'}`);
  console.log(`Description: ${card.description || '(none)'}`);
  if (card.checklist.length) {
    console.log('Checklist:');
    for (const i of card.checklist) console.log(`  ${i.id}. [${i.done ? 'x' : ' '}] ${i.text}`);
  }
}

const need = (v, msg) => {
  if (v === undefined || v === true || v === '') throw new Error(msg);
  return v;
};
const str = (v) => (v === true ? '' : v);

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, flags } = parse(rest);

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return console.log(HELP);

  if (cmd === 'serve') {
    if (flags.port) process.env.PORT = String(flags.port);
    if (flags.open) process.env.KANFLASH_OPEN = '1';
    await import('../server/server.js');
    return;
  }

  const board = loadBoard();
  const save = () => saveBoard(board);

  switch (cmd) {
    case 'list':
    case 'ls':
      if (flags.json) return console.log(JSON.stringify(board, null, 2));
      return printBoard(board, str(flags.col) || undefined);

    case 'show': {
      const { card, col } = findCard(board, need(pos[0], 'Usage: kanflash show <id>'));
      return flags.json ? console.log(JSON.stringify({ column: col.title, ...card }, null, 2)) : printCard(card, col);
    }

    case 'next': {
      const n = nextCard(board);
      if (!n) return console.log(`Nothing to pick up in "${board.columns[0]?.title}" (empty, or only "won't do" cards).`);
      return printCard(n.card, n.col);
    }

    case 'add': {
      const card = addCard(board, {
        title: need(pos[0], 'Usage: kanflash add "title" [--col column]'),
        description: str(flags.desc) || '',
        column: str(flags.col) || undefined,
        checklist: flags.check || [],
        priority: flags.priority,
      });
      save();
      const col = findCard(board, card.id).col;
      return console.log(`Created #${card.id} in "${col.title}": ${card.title}`);
    }

    case 'move': {
      const position = flags.pos ? Number(flags.pos) - 1 : undefined;
      const r = moveCard(board, need(pos[0], 'Usage: kanflash move <id> <column>'), need(pos[1], 'Missing column.'), position, { force: !!flags.force });
      save();
      return console.log(`#${r.card.id} moved: "${r.from.title}" → "${r.to.title}"`);
    }

    case 'start':
    case 'done': {
      const target = cmd === 'start' ? board.columns[1] : board.columns[board.columns.length - 1];
      if (!target) throw new Error('The target column does not exist.');
      const r = moveCard(board, need(pos[0], `Usage: kanflash ${cmd} <id>`), target.id, undefined, { force: !!flags.force });
      save();
      return console.log(`#${r.card.id} moved: "${r.from.title}" → "${r.to.title}"`);
    }

    case 'edit': {
      if (flags.title === undefined && flags.desc === undefined && flags.priority === undefined) throw new Error('Use --title, --desc and/or --priority.');
      const card = editCard(board, need(pos[0], 'Usage: kanflash edit <id> --title/--desc'), {
        title: flags.title === undefined ? undefined : str(flags.title),
        description: flags.desc === undefined ? undefined : str(flags.desc),
        priority: flags.priority === undefined ? undefined : str(flags.priority),
      });
      save();
      return console.log(`Updated #${card.id}`);
    }

    case 'rm':
    case 'delete': {
      const card = removeCard(board, need(pos[0], 'Usage: kanflash rm <id>'));
      save();
      return console.log(`Removed #${card.id}: ${card.title}`);
    }

    case 'check':
    case 'uncheck': {
      const { card, item } = setItemDone(board, need(pos[0], `Usage: kanflash ${cmd} <id> <item>`), need(pos[1], 'Missing item.'), cmd === 'check');
      save();
      return console.log(`#${card.id} item ${item.id} ${item.done ? 'checked' : 'reopened'}: ${item.text}`);
    }

    case 'add-item': {
      const { card, item } = addItem(board, need(pos[0], 'Usage: kanflash add-item <id> "text"'), need(pos[1], 'Missing text.'));
      save();
      return console.log(`#${card.id} item ${item.id} added: ${item.text}`);
    }

    case 'rm-item': {
      const { card, item } = removeItem(board, need(pos[0], 'Usage: kanflash rm-item <id> <item>'), need(pos[1], 'Missing item.'));
      save();
      return console.log(`#${card.id} item removed: ${item.text}`);
    }

    case 'col-add': {
      const col = addColumn(board, need(pos[0], 'Usage: kanflash col-add "name" [--limit n]'), flags.limit);
      save();
      return console.log(`Column created: ${col.title}`);
    }

    case 'col-limit': {
      const col = setColumnLimit(board, need(pos[0], 'Usage: kanflash col-limit <column> <n|none>'), need(pos[1], 'Missing limit (a number or "none").'));
      save();
      return console.log(col.wip ? `Column "${col.title}" limit set to ${col.wip}.` : `Column "${col.title}" no longer has a limit.`);
    }

    case 'col-rename': {
      const col = renameColumn(board, need(pos[0], 'Usage: kanflash col-rename <column> "new"'), need(pos[1], 'Missing new name.'));
      save();
      return console.log(`Column renamed to: ${col.title}`);
    }

    case 'col-rm': {
      const col = removeColumn(board, need(pos[0], 'Usage: kanflash col-rm <column>'));
      save();
      return console.log(`Column removed: ${col.title}`);
    }

    case 'col-move': {
      const col = moveColumn(board, need(pos[0], 'Usage: kanflash col-move <column> <pos>'), Number(need(pos[1], 'Missing position.')) - 1);
      save();
      return console.log(`Column "${col.title}" moved.`);
    }

    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.error(HELP);
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('Error: ' + e.message);
  process.exit(1);
});
