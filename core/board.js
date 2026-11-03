// KanFlash data core: shared by the CLI and the server.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BOARD_FILE = process.env.KANFLASH_BOARD
  ? path.resolve(process.env.KANFLASH_BOARD)
  : path.join(ROOT, 'data', 'board.json');

export function defaultBoard() {
  return {
    version: 1,
    name: 'KanFlash',
    rev: 0,
    nextId: 1,
    background: null, // version stamp of data/background.jpg, or null
    columns: [
      { id: 'todo', title: 'To do', cards: [] },
      { id: 'doing', title: 'In progress', cards: [] },
      { id: 'done', title: 'Done', cards: [] },
    ],
  };
}

const now = () => new Date().toISOString();

// MoSCoW priorities, from most to least urgent.
export const PRIORITIES = ['must', 'should', 'could', 'wont'];
export const PRIORITY_LABEL = { must: 'Must', should: 'Should', could: 'Could', wont: "Won't" };

/** 'must' | 'should' | 'could' | 'wont' (aliases accepted) -> key; '', 'none' or undefined -> null. */
export function parsePriority(v) {
  if (v === undefined || v === null || v === true) return null;
  const k = String(v).trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!k || k === 'none' || k === 'clear') return null;
  if (PRIORITIES.includes(k)) return k;
  throw new Error(`Invalid priority "${v}". Use: must, should, could, wont, or none.`);
}

/** Positive integer -> number; '', 'none', 0 or undefined -> null (no limit). */
export function parseLimit(v) {
  if (v === undefined || v === null || v === true) return null;
  const k = String(v).trim().toLowerCase();
  if (!k || k === 'none' || k === 'off' || k === '0') return null;
  const n = Number(k);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid limit "${v}". Use a whole number of 1 or more, or "none".`);
  return n;
}

export function normalize(raw) {
  const b = raw && typeof raw === 'object' ? raw : {};
  const board = {
    version: 1,
    name: String(b.name || 'KanFlash'),
    rev: Number.isInteger(b.rev) ? b.rev : 0,
    nextId: 1,
    background: Number.isFinite(b.background) ? b.background : null,
    columns: [],
  };
  let maxId = 0;
  const seenCols = new Set();
  for (const c of Array.isArray(b.columns) ? b.columns : []) {
    let id = String(c.id || '');
    if (!id || seenCols.has(id)) id = 'c' + Math.random().toString(36).slice(2, 7);
    seenCols.add(id);
    const col = { id, title: String(c.title || 'Untitled'), wip: Number.isInteger(c.wip) && c.wip > 0 ? c.wip : null, cards: [] };
    for (const k of Array.isArray(c.cards) ? c.cards : []) {
      const id = Number(k.id);
      if (!Number.isInteger(id) || id < 1) continue;
      maxId = Math.max(maxId, id);
      col.cards.push({
        id,
        title: String(k.title || 'Untitled'),
        description: String(k.description || ''),
        priority: PRIORITIES.includes(k.priority) ? k.priority : null,
        checklist: (Array.isArray(k.checklist) ? k.checklist : []).map((i, n) => ({
          id: Number.isInteger(i.id) ? i.id : n + 1,
          text: String(i.text || ''),
          done: !!i.done,
        })),
        createdAt: k.createdAt || now(),
        updatedAt: k.updatedAt || now(),
      });
    }
    board.columns.push(col);
  }
  board.nextId = Math.max(Number(b.nextId) || 1, maxId + 1);
  return board;
}

export function loadBoard() {
  try {
    return normalize(JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8')));
  } catch (e) {
    if (e.code === 'ENOENT') {
      const b = defaultBoard();
      writeFile(b);
      return b;
    }
    throw new Error(`Could not read ${BOARD_FILE}: ${e.message}`);
  }
}

function writeFile(board) {
  fs.mkdirSync(path.dirname(BOARD_FILE), { recursive: true });
  const text = JSON.stringify(board, null, 2) + '\n';
  const tmp = BOARD_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, BOARD_FILE);
  } catch {
    fs.writeFileSync(BOARD_FILE, text);
  }
}

/** Saves and bumps the revision. If expectedRev is given and does not match, throws a 'CONFLICT' error. */
export function saveBoard(board, expectedRev) {
  let current = null;
  try {
    current = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
  } catch {}
  const currentRev = current && Number.isInteger(current.rev) ? current.rev : 0;
  if (expectedRev !== undefined && expectedRev !== currentRev) {
    const err = new Error('Conflict: the board changed since it was last read.');
    err.code = 'CONFLICT';
    throw err;
  }
  const out = normalize(board);
  out.rev = currentRev + 1;
  writeFile(out);
  return out;
}

// ---------- lookups ----------

const norm = (s) => String(s).trim().toLowerCase();

export function findColumn(board, ref) {
  const r = norm(ref);
  const partial = board.columns.filter((c) => norm(c.title).includes(r));
  const col =
    board.columns.find((c) => norm(c.id) === r) ||
    board.columns.find((c) => norm(c.title) === r) ||
    (partial.length === 1 ? partial[0] : undefined);
  if (!col) throw new Error(`Column not found: "${ref}". Columns: ${board.columns.map((c) => c.title).join(', ')}`);
  return col;
}

export function findCard(board, ref) {
  const id = Number(String(ref).replace(/^#/, ''));
  for (const col of board.columns) {
    const idx = col.cards.findIndex((c) => c.id === id);
    if (idx >= 0) return { card: col.cards[idx], col, idx };
  }
  throw new Error(`Card not found: ${ref}`);
}

// ---------- operations (they mutate the in-memory board) ----------

export function addCard(board, { title, description = '', column, checklist = [], priority }) {
  if (!title || !String(title).trim()) throw new Error('A card needs a title.');
  const col = column ? findColumn(board, column) : board.columns[0];
  if (!col) throw new Error('The board has no columns.');
  const card = {
    id: board.nextId++,
    title: String(title).trim(),
    description,
    priority: parsePriority(priority),
    checklist: checklist.map((text, i) => ({ id: i + 1, text: String(text), done: false })),
    createdAt: now(),
    updatedAt: now(),
  };
  col.cards.push(card);
  return card;
}

export function moveCard(board, ref, columnRef, position, { force = false } = {}) {
  const { card, col, idx } = findCard(board, ref);
  const target = findColumn(board, columnRef);
  if (!force && target !== col && target.wip && target.cards.length >= target.wip) {
    throw new Error(
      `Column "${target.title}" is full (${target.cards.length}/${target.wip}). Finish or move something out first, or use --force if the user asked for it.`
    );
  }
  col.cards.splice(idx, 1);
  const pos = position === undefined ? target.cards.length : Math.max(0, Math.min(target.cards.length, position));
  target.cards.splice(pos, 0, card);
  card.updatedAt = now();
  return { card, from: col, to: target };
}

export function editCard(board, ref, { title, description, priority }) {
  const { card } = findCard(board, ref);
  if (priority !== undefined) card.priority = parsePriority(priority);
  if (title !== undefined) card.title = String(title);
  if (description !== undefined) card.description = String(description);
  card.updatedAt = now();
  return card;
}

export function removeCard(board, ref) {
  const { card, col, idx } = findCard(board, ref);
  col.cards.splice(idx, 1);
  return card;
}

export function findItem(card, ref) {
  const n = Number(ref);
  const item =
    (Number.isInteger(n) && card.checklist.find((i) => i.id === n)) ||
    card.checklist.find((i) => norm(i.text) === norm(ref));
  if (!item) throw new Error(`Checklist item not found: "${ref}"`);
  return item;
}

export function addItem(board, ref, text) {
  const { card } = findCard(board, ref);
  const id = card.checklist.reduce((m, i) => Math.max(m, i.id), 0) + 1;
  const item = { id, text: String(text), done: false };
  card.checklist.push(item);
  card.updatedAt = now();
  return { card, item };
}

export function setItemDone(board, ref, itemRef, done) {
  const { card } = findCard(board, ref);
  const item = findItem(card, itemRef);
  item.done = done;
  card.updatedAt = now();
  return { card, item };
}

export function removeItem(board, ref, itemRef) {
  const { card } = findCard(board, ref);
  const item = findItem(card, itemRef);
  card.checklist = card.checklist.filter((i) => i !== item);
  card.updatedAt = now();
  return { card, item };
}

/** The card to pick up next: highest priority in the first column (cards marked "won't" are skipped). */
export function nextCard(board) {
  const col = board.columns[0];
  if (!col) return null;
  const rank = (c) => (c.priority ? PRIORITIES.indexOf(c.priority) : 2.5);
  const cards = col.cards.filter((c) => c.priority !== 'wont').sort((a, b) => rank(a) - rank(b) || a.id - b.id);
  return cards.length ? { card: cards[0], col } : null;
}

export function setColumnLimit(board, ref, limit) {
  const col = findColumn(board, ref);
  col.wip = parseLimit(limit);
  return col;
}

export function addColumn(board, title, limit) {
  if (!title || !String(title).trim()) throw new Error('A column needs a name.');
  const base = norm(title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'col';
  let id = base;
  for (let n = 2; board.columns.some((c) => c.id === id); n++) id = `${base}-${n}`;
  const col = { id, title: String(title).trim(), wip: parseLimit(limit), cards: [] };
  board.columns.push(col);
  return col;
}

export function renameColumn(board, ref, title) {
  const col = findColumn(board, ref);
  col.title = String(title).trim();
  return col;
}

export function removeColumn(board, ref) {
  const col = findColumn(board, ref);
  if (col.cards.length) throw new Error(`The column "${col.title}" has ${col.cards.length} card(s). Move or delete them first.`);
  board.columns = board.columns.filter((c) => c !== col);
  return col;
}

export function moveColumn(board, ref, position) {
  const col = findColumn(board, ref);
  board.columns = board.columns.filter((c) => c !== col);
  board.columns.splice(Math.max(0, Math.min(board.columns.length, position)), 0, col);
  return col;
}
