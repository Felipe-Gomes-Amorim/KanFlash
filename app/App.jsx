import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

const api = {
  async get() {
    const r = await fetch('/api/board');
    if (!r.ok) throw new Error('Failed to load the board');
    return r.json();
  },
  async put(board) {
    const r = await fetch('/api/board', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(board),
    });
    return { status: r.status, data: await r.json() };
  },
};

const TONES = ['blue', 'pink', 'green', 'amber'];
const tone = (i) => TONES[i % TONES.length];
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

// Tilt (in degrees) applied to a lifted item, by kind.
const LIFT_TILT = { card: 2, col: 1 };

/**
 * FLIP: after every render, items with data-flip that changed position slide
 * from the old spot to the new one; new items appear with a small "pop".
 * `landing` holds where a dropped item should fly from (the floating clone's position).
 */
function useFlip(landing) {
  const prev = useRef(new Map());
  const first = useRef(true);
  const stale = useRef(false);

  useEffect(() => {
    const mark = () => (stale.current = true);
    window.addEventListener('scroll', mark, true);
    window.addEventListener('resize', mark);
    return () => {
      window.removeEventListener('scroll', mark, true);
      window.removeEventListener('resize', mark);
    };
  }, []);

  useLayoutEffect(() => {
    const els = document.querySelectorAll('[data-flip]');
    const still = calm() || first.current || stale.current;
    const next = new Map();
    els.forEach((el) => {
      const key = el.dataset.flip;
      const running = el.getAnimations().filter((a) => a.id === 'flip');
      const visual = el.getBoundingClientRect(); // already includes a running animation
      running.forEach((a) => a.cancel());
      const r = el.getBoundingClientRect(); // real layout position
      if (!r.width && !r.height) return;
      next.set(key, r);
      if (still) return;

      let anim;
      const land = landing.current[key];
      if (land) {
        const dx = land.rect.left - r.left;
        const dy = land.rect.top - r.top;
        const tilt = (land.tilt || 0) + (LIFT_TILT[key.split('-')[0]] || 0);
        anim = el.animate(
          [{ transform: `translate(${dx}px, ${dy}px) rotate(${tilt}deg) scale(1.03)` }, { transform: 'none' }],
          { duration: 260, easing: EASE }
        );
      } else if (running.length || prev.current.has(key)) {
        const from = running.length ? visual : prev.current.get(key);
        const dx = from.left - r.left;
        const dy = from.top - r.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1)
          anim = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 230, easing: EASE });
      } else {
        anim = el.animate(
          [{ opacity: 0, transform: 'scale(0.9) translateY(6px)' }, { opacity: 1, transform: 'none' }],
          { duration: 220, easing: EASE }
        );
      }
      if (anim) anim.id = 'flip';
    });
    landing.current = {};
    prev.current = next;
    if (els.length) first.current = false;
    stale.current = false;
  });
}

// ---------- small pieces ----------

// Text field that only commits on blur (avoids saving on every keystroke).
function Field({ value, onCommit, multiline, ...rest }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && onCommit(v);
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Tag
      {...rest}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (!multiline && e.key === 'Enter') e.target.blur();
        if (e.key === 'Escape') {
          setV(value);
          e.target.blur();
        }
      }}
    />
  );
}

function AddInline({ placeholder, onAdd, label, className = '' }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const submit = () => {
    if (text.trim()) onAdd(text.trim());
    setText('');
  };
  if (!open)
    return (
      <button className={'add-btn ' + className} onClick={() => setOpen(true)}>
        <span className="plus">+</span> {label}
      </button>
    );
  return (
    <input
      className="add-input"
      autoFocus
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') {
          setText('');
          setOpen(false);
        }
      }}
      onBlur={() => {
        if (!text.trim()) setOpen(false);
      }}
    />
  );
}

// Big number + pill bar with the counter inside.
function Meter({ label, big, value, max, color }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="meter">
      <div className="meter-label">{label}</div>
      <div className="meter-row">
        <span key={big} className={'meter-big bump ' + color}>{big}</span>
        <div className={'pill-bar ' + color} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
          <div className="pill-fill" style={{ width: pct + '%' }} />
          <span className="pill-text">{value}/{max}</span>
        </div>
      </div>
    </div>
  );
}

function Orb() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
      <path d="M18.5 4 8 18.5h6.5L13 28l11-15h-6.8z" fill="#fff" />
    </svg>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="clock">
      <b>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
      <span>{now.toLocaleDateString()}</span>
    </div>
  );
}

// ---------- start menu ----------

function StartMenu({ board, update, reload, onOpenCard, onClose }) {
  const [q, setQ] = useState('');
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const all = useMemo(
    () => board.columns.flatMap((col) => col.cards.map((card) => ({ card, col }))),
    [board]
  );
  const query = q.trim().toLowerCase();
  const list = query
    ? all.filter(({ card }) => (card.title + ' ' + card.description).toLowerCase().includes(query))
    : [...all].sort((a, b) => b.card.updatedAt.localeCompare(a.card.updatedAt)).slice(0, 8);

  return (
    <>
      <div className="scrim" onMouseDown={onClose} />
      <div className="start-menu" role="dialog" aria-label="Menu">
        <div className="start-left">
          <div className="start-heading">{query ? `Results (${list.length})` : 'Recently updated'}</div>
          <ul className="start-list">
            {list.map(({ card, col }) => (
              <li key={card.id}>
                <button
                  onClick={() => {
                    onOpenCard(card.id);
                    onClose();
                  }}
                >
                  <span className={'dot ' + tone(board.columns.indexOf(col))} />
                  <span className="grow">{card.title}</span>
                  <small>{col.title}</small>
                </button>
              </li>
            ))}
            {!list.length && <li className="start-empty">{query ? 'No cards found.' : 'No cards yet. Create the first one on the right.'}</li>}
          </ul>
          <input
            className="start-search"
            autoFocus
            placeholder="Search cards"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="start-right">
          <div className="start-action">
            <AddInline
              className="start-btn"
              label="New card"
              placeholder={`Title (goes to ${board.columns[0]?.title || 'the first column'})`}
              onAdd={(title) => {
                if (!board.columns.length) return;
                update((b) => {
                  const now = new Date().toISOString();
                  b.columns[0].cards.push({ id: b.nextId++, title, description: '', checklist: [], createdAt: now, updatedAt: now });
                });
                onClose();
              }}
            />
          </div>
          <div className="start-action">
            <AddInline
              className="start-btn"
              label="New column"
              placeholder="Column name"
              onAdd={(title) => {
                update((b) => b.columns.push({ id: 'c' + Math.random().toString(36).slice(2, 7), title, cards: [] }));
                onClose();
              }}
            />
          </div>
          <button
            className="start-btn"
            onClick={() => {
              reload(true);
              onClose();
            }}
          >
            Reload board
          </button>
        </div>
      </div>
    </>
  );
}

// ---------- card window ----------

function CardModal({ board, cardId, update, onClose: finish }) {
  const [closing, setClosing] = useState(false);
  // closes by playing the exit animation (skipped if the user asked for less motion)
  const onClose = () => (calm() ? finish() : setClosing(true));
  let found = null;
  for (const col of board.columns) {
    const card = col.cards.find((c) => c.id === cardId);
    if (card) found = { card, col };
  }
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && document.activeElement === document.body && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  if (!found) return null;
  const { card, col } = found;
  const patch = (fn) =>
    update((b) => {
      for (const c of b.columns) {
        const k = c.cards.find((x) => x.id === cardId);
        if (k) {
          fn(k, c, b);
          k.updatedAt = new Date().toISOString();
        }
      }
    });
  const done = card.checklist.filter((i) => i.done).length;

  return (
    <div className={'overlay' + (closing ? ' closing' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog"
        role="dialog"
        aria-label={`Card ${card.id}`}
        onAnimationEnd={(e) => closing && e.target === e.currentTarget && finish()}
      >
        <div className="dialog-bar">
          <span className="dialog-title">Card #{card.id}</span>
          <button className="win-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="dialog-body">
          <Field className="title-input" value={card.title} onCommit={(v) => v.trim() && patch((k) => (k.title = v.trim()))} />
          <div className="meta">
            <label>
              Column
              <select
                value={col.id}
                onChange={(e) =>
                  update((b) => {
                    const from = b.columns.find((c) => c.id === col.id);
                    const to = b.columns.find((c) => c.id === e.target.value);
                    const i = from.cards.findIndex((c) => c.id === cardId);
                    const [k] = from.cards.splice(i, 1);
                    to.cards.push(k);
                  })
                }
              >
                {board.columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </label>
            <span>Created {new Date(card.createdAt).toLocaleDateString()}</span>
          </div>

          <h4>Description</h4>
          <Field multiline rows={4} placeholder="Add details…" value={card.description} onCommit={(v) => patch((k) => (k.description = v))} />

          <h4>Checklist</h4>
          {card.checklist.length > 0 && (
            <Meter label="Items done" big={done} value={done} max={card.checklist.length} color="green" />
          )}
          <ul className="checklist">
            {card.checklist.map((item) => (
              <li key={item.id} className={item.done ? 'done' : ''}>
                <input
                  type="checkbox"
                  checked={item.done}
                  aria-label="Done"
                  onChange={() => patch((k) => (k.checklist.find((i) => i.id === item.id).done = !item.done))}
                />
                <Field value={item.text} onCommit={(v) => patch((k) => (k.checklist.find((i) => i.id === item.id).text = v))} />
                <button className="x" title="Remove item" onClick={() => patch((k) => (k.checklist = k.checklist.filter((i) => i.id !== item.id)))}>✕</button>
              </li>
            ))}
          </ul>
          <AddInline
            className="light"
            label="Add item"
            placeholder="New item (Enter)"
            onAdd={(text) =>
              patch((k) => k.checklist.push({ id: k.checklist.reduce((m, i) => Math.max(m, i.id), 0) + 1, text, done: false }))
            }
          />

          <div className="dialog-foot">
            <button
              className="danger"
              onClick={() => {
                if (!confirm(`Delete card #${card.id}?`)) return;
                update((b) => b.columns.forEach((c) => (c.cards = c.cards.filter((k) => k.id !== cardId))));
                finish();
              }}
            >
              Delete card
            </button>
            <button className="primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- app ----------

export default function App() {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [openCard, setOpenCard] = useState(null);
  const [menu, setMenu] = useState(false);
  const [focusCol, setFocusCol] = useState(null);
  const [over, setOver] = useState(null); // {type:'card', col, index} | {type:'col', index}
  const [dragging, setDragging] = useState(null); // {type, id, w, h}
  const boardRef = useRef(null);
  const saving = useRef(Promise.resolve());
  const pending = useRef(0);
  const savedRev = useRef(0);
  const mainRef = useRef(null);
  const session = useRef(null);
  const suppressClick = useRef(false);
  const landing = useRef({});

  useFlip(landing);

  const reload = useCallback(async (force) => {
    if (pending.current > 0 && !force) return; // local changes are still being saved
    try {
      const b = await api.get();
      if (pending.current > 0 && !force) return;
      boardRef.current = b;
      setBoard(b);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    reload();
    const es = new EventSource('/api/events');
    es.onmessage = () => reload();
    return () => es.close();
  }, [reload]);

  useEffect(() => {
    if (board && board.rev > savedRev.current) savedRev.current = board.rev;
  }, [board]);

  // Applies a change optimistically and saves it (serialized so no revision is lost).
  const update = useCallback((fn) => {
    const draft = structuredClone(boardRef.current);
    fn(draft);
    boardRef.current = draft;
    setBoard(draft);
    pending.current++;
    saving.current = saving.current.then(async () => {
      try {
        const toSave = { ...boardRef.current, rev: savedRev.current };
        const { status, data } = await api.put(toSave);
        if (status === 409) {
          boardRef.current = data.board;
          setBoard(data.board);
          savedRev.current = data.board.rev;
        } else if (status === 200) {
          savedRev.current = data.rev;
          boardRef.current = { ...boardRef.current, rev: data.rev, nextId: data.nextId };
        } else throw new Error(data.error || 'Failed to save');
      } catch (e) {
        setError(e.message);
      } finally {
        pending.current--;
      }
    });
  }, []);

  const stats = useMemo(() => {
    if (!board) return null;
    const total = board.columns.reduce((n, c) => n + c.cards.length, 0);
    const last = board.columns[board.columns.length - 1];
    const doneCards = board.columns.length > 1 && last ? last.cards.length : 0;
    let items = 0;
    let itemsDone = 0;
    for (const c of board.columns)
      for (const k of c.cards) {
        items += k.checklist.length;
        itemsDone += k.checklist.filter((i) => i.done).length;
      }
    const doing = board.columns[1]?.cards[0] || null;
    return { total, doneCards, items, itemsDone, doing };
  }, [board]);

  if (!board) return <div className="center">{error || 'Loading…'}</div>;

  const jumpTo = (id) => {
    setFocusCol(id);
    const el = document.getElementById('col-' + id);
    el?.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  };

  // ---------- pointer dragging (cards and columns) ----------

  // Finds which position (not counting the dragged item) the pointer is at,
  // using layout measurements that do not change while items slide around.
  const indexIn = (container, items, horizontal, pointer, gap) => {
    const box = container.getBoundingClientRect();
    const cs = getComputedStyle(container);
    const rel = horizontal
      ? pointer - box.left + container.scrollLeft
      : pointer - box.top + container.scrollTop;
    let pos = parseFloat(horizontal ? cs.paddingLeft : cs.paddingTop) || 0;
    let idx = 0;
    for (const el of items) {
      const size = horizontal ? el.offsetWidth : el.offsetHeight;
      if (rel > pos + size / 2) idx++;
      pos += size + gap;
    }
    return idx;
  };

  const tick = () => {
    const s = session.current;
    if (!s || !s.started) return;
    const now = performance.now();
    const lift = clamp((now - s.t0) / 140, 0, 1);
    const vx = s.x - s.lx;
    s.lx = s.x;
    s.tilt = calm() ? 0 : clamp(s.tilt * 0.85 + vx * 0.5, -7, 7);
    s.wrap.style.transform = `translate3d(${s.x - s.ox}px, ${s.y - s.oy}px, 0)`;
    s.inner.style.transform = `rotate(${s.tilt + (calm() ? 0 : LIFT_TILT[s.type] * lift)}deg) scale(${1 + 0.03 * lift})`;

    const main = mainRef.current;
    const mr = main.getBoundingClientRect();
    const inMain = s.y > mr.top - 30 && s.y < mr.bottom + 30;
    if (inMain) {
      if (s.x < mr.left + 60 && s.x > mr.left - 40) main.scrollLeft -= 14;
      else if (s.x > mr.right - 60 && s.x < mr.right + 40) main.scrollLeft += 14;
    }

    let next = null;
    if (inMain && s.x > mr.left - 40 && s.x < mr.right + 40) {
      if (s.type === 'card') {
        const cols = [...main.querySelectorAll(':scope > .column[data-col]')];
        let target = null;
        let best = Infinity;
        for (const c of cols) {
          const r = c.getBoundingClientRect();
          const d = s.x < r.left ? r.left - s.x : s.x > r.right ? s.x - r.right : 0;
          if (d < best) {
            best = d;
            target = c;
          }
        }
        if (target) {
          const box = target.querySelector('.cards');
          const br = box.getBoundingClientRect();
          if (s.y < br.top + 40) box.scrollTop -= 10;
          else if (s.y > br.bottom - 40) box.scrollTop += 10;
          const items = [...box.querySelectorAll(':scope > .card')];
          next = { type: 'card', col: target.dataset.col, index: indexIn(box, items, false, s.y, 8) };
        }
      } else {
        const cols = [...main.querySelectorAll(':scope > .column[data-col]')];
        next = { type: 'col', index: indexIn(main, cols, true, s.x, 12) };
      }
    }
    const prev = s.over;
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      s.over = next;
      setOver(next);
    }
    s.raf = requestAnimationFrame(tick);
  };

  const beginDrag = (s) => {
    const r = s.el.getBoundingClientRect();
    s.w = r.width;
    s.h = r.height;
    s.ox = s.sx - r.left;
    s.oy = s.sy - r.top;
    const clone = s.el.cloneNode(true);
    clone.removeAttribute('id');
    clone.removeAttribute('data-flip');
    clone.querySelectorAll('[id],[data-flip]').forEach((n) => {
      n.removeAttribute('id');
      n.removeAttribute('data-flip');
    });
    clone.classList.remove('drop-left', 'focused');
    clone.style.cssText += `;width:${r.width}px;height:${r.height}px;max-height:none;flex:none;margin:0`;
    clone.classList.add('float-inner');
    const wrap = document.createElement('div');
    wrap.className = 'float';
    wrap.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
    wrap.appendChild(clone);
    document.body.appendChild(wrap);
    document.body.classList.add('is-dragging');
    window.getSelection()?.removeAllRanges();
    Object.assign(s, { started: true, wrap, inner: clone, t0: performance.now(), lx: s.x, tilt: 0, over: null });
    setDragging({ type: s.type, id: s.id, w: r.width, h: r.height });
    s.raf = requestAnimationFrame(tick);
  };

  const finishDrag = (s, commit) => {
    cancelAnimationFrame(s.raf);
    const rect = s.wrap.getBoundingClientRect();
    landing.current[`${s.type}-${s.id}`] = { rect, tilt: s.tilt };
    const target = s.over;
    flushSync(() => {
      if (commit && target && target.type === s.type) {
        update((b) => {
          if (s.type === 'card') {
            let card;
            for (const c of b.columns) {
              const i = c.cards.findIndex((k) => k.id === s.id);
              if (i >= 0) [card] = c.cards.splice(i, 1);
            }
            const to = b.columns.find((c) => c.id === target.col);
            if (card && to) {
              card.updatedAt = new Date().toISOString();
              to.cards.splice(target.index, 0, card);
            }
          } else {
            const i = b.columns.findIndex((c) => c.id === s.id);
            if (i >= 0) {
              const [col] = b.columns.splice(i, 1);
              b.columns.splice(target.index, 0, col);
            }
          }
        });
      }
      setDragging(null);
      setOver(null);
    });
    s.wrap.remove();
    document.body.classList.remove('is-dragging');
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 60);
    session.current = null;
  };

  const press = (e, type, id) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    if (type === 'col' && e.target.closest('input,button,textarea,select')) return;
    const el = type === 'col' ? e.currentTarget.closest('.column') : e.currentTarget;
    const s = (session.current = { type, id, el, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, started: false });
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
    };
    const move = (ev) => {
      s.x = ev.clientX;
      s.y = ev.clientY;
      if (!s.started && Math.hypot(s.x - s.sx, s.y - s.sy) > 5) beginDrag(s);
    };
    const up = () => {
      stop();
      if (s.started) finishDrag(s, true);
      else session.current = null;
    };
    const cancel = () => {
      stop();
      if (s.started) finishDrag(s, false);
      else session.current = null;
    };
    const key = (ev) => ev.key === 'Escape' && s.started && cancel();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
  };

  // ---------- render ----------

  const draggedCard = dragging?.type === 'card' ? dragging.id : null;
  const draggedCol = dragging?.type === 'col' ? dragging.id : null;
  const colsView = board.columns.filter((c) => c.id !== draggedCol);
  const colSlot = <div className="col-slot" data-flip="slot" style={{ flex: `0 0 ${dragging?.w}px`, height: dragging?.h }} />;
  const cardSlot = <div className="slot" data-flip="slot" style={{ height: dragging?.h }} />;

  return (
    <div className="desk">
      <div className="window">
        <div className="titlebar">
          <span className="app-icon"><Orb /></span>
          <span className="app-title">KanFlash</span>
          {error && <button className="error" onClick={() => setError('')}>{error} ✕</button>}
          <div className="chips">
            <span className="chip"><i className="coin blue" />Cards <b key={stats.total} className="bump">{stats.total}</b></span>
            <span className="chip"><i className="coin pink" />Columns <b key={board.columns.length} className="bump">{board.columns.length}</b></span>
          </div>
        </div>

        <div className="window-body">
          <aside className="side">
            <div className="profile">
              <span className="avatar"><Orb /></span>
              <div className="profile-name">
                <Field value={board.name} aria-label="Board name" onCommit={(v) => v.trim() && update((b) => (b.name = v.trim()))} />
                <span className="pencil" aria-hidden="true">✎</span>
              </div>
            </div>

            <Meter label="Cards done" big={stats.doneCards} value={stats.doneCards} max={stats.total} color="pink" />
            <Meter label="Checklist items" big={stats.itemsDone} value={stats.itemsDone} max={stats.items} color="green" />

            <div className="focus">
              <div className="sticker-tab">In focus</div>
              {stats.doing ? (
                <button key={stats.doing.id} className="focus-card swap" onClick={() => setOpenCard(stats.doing.id)}>
                  <span className="focus-icon">☰</span>
                  <span>
                    <b>{stats.doing.title}</b>
                    {stats.doing.checklist.length > 0 && (
                      <small>{stats.doing.checklist.filter((i) => i.done).length} of {stats.doing.checklist.length} items done</small>
                    )}
                  </span>
                </button>
              ) : (
                <p className="focus-empty">
                  Nothing in progress. Drag a card to “{board.columns[1]?.title || 'the second column'}”.
                </p>
              )}
            </div>

            <nav className="shortcuts" aria-label="Columns">
              {board.columns.map((col, i) => (
                <button key={col.id} onClick={() => jumpTo(col.id)}>
                  <span className={'dot ' + tone(i)} />
                  <span className="grow">{col.title}</span>
                  <span key={col.cards.length} className="num bump">{col.cards.length}</span>
                </button>
              ))}
            </nav>
          </aside>

          <main ref={mainRef}>
            {colsView.map((col, vi) => {
              const ci = board.columns.indexOf(col);
              const list = col.cards.filter((k) => k.id !== draggedCard);
              const slotHere = over?.type === 'card' && over.col === col.id;
              return (
                <React.Fragment key={col.id}>
                  {over?.type === 'col' && over.index === vi && colSlot}
                  <section
                    id={'col-' + col.id}
                    data-col={col.id}
                    data-flip={'col-' + col.id}
                    className={'column ' + tone(ci) + (focusCol === col.id ? ' focused' : '')}
                    onAnimationEnd={(e) => e.animationName === 'glow' && setFocusCol(null)}
                  >
                    <div className="col-head" onPointerDown={(e) => press(e, 'col', col.id)}>
                      <span className="grip" title="Drag to move the column">⠿</span>
                      <Field
                        className="col-title"
                        value={col.title}
                        aria-label="Column name"
                        onCommit={(v) => v.trim() && update((b) => (b.columns.find((c) => c.id === col.id).title = v.trim()))}
                      />
                      <span key={col.cards.length} className="count bump">{col.cards.length}</span>
                      <button
                        className="x"
                        title="Delete column"
                        onClick={() => {
                          if (col.cards.length && !confirm(`Delete the column "${col.title}" and its ${col.cards.length} cards?`)) return;
                          update((b) => (b.columns = b.columns.filter((c) => c.id !== col.id)));
                        }}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="cards">
                      {list.map((card, i) => {
                        const done = card.checklist.filter((x) => x.done).length;
                        return (
                          <React.Fragment key={card.id}>
                            {slotHere && over.index === i && cardSlot}
                            <article
                              className="card"
                              data-flip={'card-' + card.id}
                              tabIndex={0}
                              onPointerDown={(e) => press(e, 'card', card.id)}
                              onClick={() => !suppressClick.current && setOpenCard(card.id)}
                              onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && setOpenCard(card.id)}
                            >
                              <div className="card-title">{card.title}</div>
                              <div className="card-meta">
                                <span>#{card.id}</span>
                                {card.description && <span title="Has a description">☰</span>}
                                {card.checklist.length > 0 && (
                                  <span className={'mini' + (done === card.checklist.length ? ' all' : '')}>
                                    <span className="mini-bar"><i style={{ width: (done / card.checklist.length) * 100 + '%' }} /></span>
                                    {done}/{card.checklist.length}
                                  </span>
                                )}
                              </div>
                            </article>
                          </React.Fragment>
                        );
                      })}
                      {slotHere && over.index >= list.length && cardSlot}
                      {!list.length && !slotHere && <p className="col-empty">Drop a card here</p>}
                    </div>

                    <AddInline
                      label="Add card"
                      placeholder="Card title (Enter)"
                      onAdd={(title) =>
                        update((b) => {
                          const now = new Date().toISOString();
                          b.columns.find((c) => c.id === col.id).cards.push({
                            id: b.nextId++, title, description: '', checklist: [], createdAt: now, updatedAt: now,
                          });
                        })
                      }
                    />
                  </section>
                </React.Fragment>
              );
            })}
            {over?.type === 'col' && over.index >= colsView.length && colSlot}

            <div className="column new-col">
              <AddInline
                label="Add column"
                placeholder="Column name (Enter)"
                onAdd={(title) =>
                  update((b) => {
                    b.columns.push({ id: 'c' + Math.random().toString(36).slice(2, 7), title, cards: [] });
                  })
                }
              />
            </div>
          </main>
        </div>
      </div>

      <footer className="taskbar">
        <button className={'orb' + (menu ? ' open' : '')} onClick={() => setMenu((m) => !m)} aria-label="Open menu" aria-expanded={menu}>
          <Orb />
        </button>
        <nav className="tabs" aria-label="Jump to column">
          {board.columns.map((col) => (
            <button key={col.id} className={focusCol === col.id ? 'active' : ''} onClick={() => jumpTo(col.id)}>
              {col.title}
            </button>
          ))}
        </nav>
        <Clock />
      </footer>

      {menu && (
        <StartMenu board={board} update={update} reload={reload} onOpenCard={setOpenCard} onClose={() => setMenu(false)} />
      )}
      {openCard !== null && (
        <CardModal board={board} cardId={openCard} update={update} onClose={() => setOpenCard(null)} />
      )}
    </div>
  );
}
