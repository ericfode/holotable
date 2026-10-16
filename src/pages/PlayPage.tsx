import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Flag, Hand, Loader2, Minus, Play, Plus, RotateCcw, Send, Undo2 } from 'lucide-react';
import { Board } from '../components/Board';
import { Card, type Focus } from '../components/Card';
import { FloatingZoom } from '../components/CardZoom';
import { Kbd, KeyHelp, KeysButton, useKeyHints } from '../components/Keys';
import { CONTROL, eventKey, isTyping, playKeys, PRIMARY, type PlayKeys } from '../play/keys';
import { cardById, trackUnits } from '../data/derive';
import type { CardRef, Seat, Snapshot } from '../data/types';
import { cardTextBySet } from '../lib/cardText';
import { createSettingsStore, SettingsProvider } from '../lib/settings';
import { hashParam } from '../lib/route';
import { reportOnScreen } from '../kit/feedback';
import { PickContext, type Pick } from '../play/pick';
import { BoardLines, type Trail } from '../play/BoardLines';
import { TableContext, type DeckOption, type Prep, type TableOptions } from '../play/client';
import { firstMode, startModes, type StartMode } from '../play/modes';
import { Versus } from '../play/Versus';
import { actionCardId, endText, isDud, moveIcon, moveText, moveVerb, noEffectText, promptText, splitProblem, toSnapshot, type Action, type DecideMsg, type Distribute, type EndMsg, type HelloMsg, type MoveMsg, type TableMsg } from '../play/protocol';
import { DeckImport, ModeTabs, PairingPanel, PeopleStart, usePairing } from '../play/StartModes';

/**
 * Play mode (#/play): a person sits at a table (the arena's bot/table) against a bot. The board is the replay board
 * drawn from the person's seat; every legal move is a glowing card, a button in the prompt bar, or an entry in
 * "All moves", so no prompt can leave the person stuck. The table checks every answer again. The table is the
 * TableContext's (play/client.ts): the HTTP table by default, or the host page's (the viewer kit's mountPlay), which
 * may also pair the person with another person (the open-tables start screen) and add decks.
 *
 * The prompt bar sits between the two sides of the board, where the eyes are, and docks to the top or bottom edge of
 * the window while the middle of the board is scrolled away. On a touch screen each card with a move shows it as an
 * icon on the card (Card's move chip): a tap on the icon makes the move, a tap on the rest of the card opens it with its
 * moves as buttons (it never plays the card by itself). A move made by touch waits TAKE_BACK_MS before it goes to the
 * table, with a countdown ring on the card's icon and an Undo button in the bar: the table cannot take a move back
 * once it has it.
 */
export function PlayPage() {
    const table = useContext(TableContext);
    const [game, setGame] = useState<{ id: string; seat: Seat; bot: string } | null>(() => {
        const id = table.resumable ? hashParam('g') : null;
        return id ? { id, seat: 'p1', bot: hashParam('bot') ?? 'bot' } : null;
    });
    // the HTTP table keeps playing a game across a reload, so its address names the game
    const address = (to: string) => {
        if (table.resumable) {
            try {
                history.replaceState(null, '', to);
            } catch {
                // the game just isn't kept in the address
            }
        }
    };
    const begin = (g: { id: string; seat: Seat; bot: string }) => {
        setGame(g);
        address(`#/play?g=${encodeURIComponent(g.id)}&bot=${encodeURIComponent(g.bot)}`);
    };
    const leave = () => {
        setGame(null);
        address('#/play');
    };
    return game ? <Table key={game.id} {...game} onLeave={leave} /> : <StartScreen onStart={begin} />;
}

const RANDOM = 'random';
/** the start screen asks the table to fetch the shown bot once it has stayed shown this long */
const PREP_MS = 500;

/**
 * Pick a deck and an opponent. A table that offers people modes or deck import (TableOptions.people, importDeck) gets
 * the open-tables screen: mode tabs, "Add a deck", and a waiting panel while the table pairs (play/StartModes.tsx).
 */
function StartScreen({ onStart }: { onStart: (g: { id: string; seat: Seat; bot: string }) => void }) {
    const table = useContext(TableContext);
    const [opts, setOpts] = useState<TableOptions | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [bot, setBot] = useState('');
    const [deck, setDeck] = useState('');
    const [botDeck, setBotDeck] = useState('');
    const [busy, setBusy] = useState(false);
    const [mode, setMode] = useState<StartMode>('bot');
    const [prep, setPrep] = useState<Prep | null>(null);
    const pair = usePairing(table, onStart, setError);
    useEffect(() => {
        table.options().then((o) => {
            setOpts(o);
            setBot(o.bot && o.bots.includes(o.bot) ? o.bot : o.bots[0] ?? '');
            setDeck(o.decks.find((d) => d.name !== o.botDeck)?.name ?? o.decks[0]?.name ?? '');
            setBotDeck(o.botDeck);
            setMode(firstMode(startModes(o, !!table.pair), o.join));
        }, (e) => setError(String(e.message ?? e)));
    }, [table]);
    // the table fetches what the shown bot needs while the person chooses, once the pick has stayed a moment
    useEffect(() => {
        setPrep(null);
        if (!bot || mode !== 'bot' || !table.prepare) {
            return;
        }
        let stop: (() => void) | null = null;
        const t = setTimeout(() => {
            stop = table.prepare!(bot, setPrep);
        }, PREP_MS);
        return () => {
            clearTimeout(t);
            stop?.();
        };
    }, [table, bot, mode]);
    const leaderOf = (name: string) => opts?.decks.find((d) => d.name === name);
    const go = async () => {
        setBusy(true);
        setError(null);
        try {
            const g = await table.start(bot, deck, botDeck);
            onStart({ ...g, bot });
        } catch (e) {
            setError(String((e as Error).message ?? e));
            setBusy(false);
        }
    };
    if (error && !opts) {
        return <div className="p-8 max-w-xl text-dim">No table here: {error}.{table.missing ? ` ${table.missing}` : ''}</div>;
    }
    if (!opts) {
        return <div className="p-8 text-dim flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Finding the table…</div>;
    }
    const pickDeck = (label: string, value: string, set: (v: string) => void, seat: Seat, id: string, extra?: ReactNode) => {
        const d = leaderOf(value);
        return (
            <div className="flex flex-col gap-2 min-w-0">
                <label htmlFor={id} className="text-xs uppercase tracking-[0.12em] text-dim">{label}</label>
                <select id={id} className="play-select" value={value} onChange={(e) => set(e.target.value)}>
                    {seat !== 'p1' && <option value={RANDOM}>Random: one of the {opts.decks.length} lists</option>}
                    {opts.decks.map((x) => <option key={x.name} value={x.name}>{x.name}{x.style ? ` · ${x.style}` : ''}</option>)}
                </select>
                {extra}
                {d && <div className="flex gap-2 items-end" style={{ '--seat': `var(--color-${seat})` } as CSSProperties}>
                    <Card card={{ id: `${id}-leader`, n: cardTextBySet(d.leader)?.t ?? d.leader, s: d.leader }} shape="wide" kind="leader" width={144} />
                    <Card card={{ id: `${id}-base`, n: cardTextBySet(d.base)?.t ?? d.base, s: d.base }} shape="wide" kind="base" width={110} />
                </div>}
            </div>
        );
    };
    // open tables: the modes this table can pair for, and deck import when it can add one
    const modes = startModes(opts, !!table.pair);
    const people = modes.length > 1;
    const importDeck = opts.importDeck && table.importDeck ? table.importDeck.bind(table) : null;
    const added = (d: DeckOption) => {
        setOpts((o) => o && { ...o, decks: [...o.decks.filter((x) => x.name !== d.name), d] });
        setDeck(d.name);
    };
    const pickMode = (m: StartMode) => {
        setMode(m);
        setError(null);
    };
    const deckExtra = importDeck && <DeckImport onImport={importDeck} onAdded={added} />;
    return (
        <div className={`mx-auto px-4 flex flex-col max-w-5xl ${people ? 'py-10 gap-8' : 'py-4 sm:py-8 gap-4'}`}>
            {people && (
                <header className="flex flex-col gap-2">
                    <span className="text-xs uppercase tracking-[0.16em] text-gold font-mono">Play mode</span>
                    <h1 className="font-display text-3xl font-bold">Open tables</h1>
                    {opts.you && <span className="text-xs text-dim">You play as <span className="font-mono text-fg">{opts.you}</span></span>}
                    <p className="text-dim max-w-xl">{table.note ?? 'Play another person or a bot on the real rules engine. Each side sees only its own seat: your hand and your deck stay hidden from the other.'}</p>
                </header>
            )}
            {pair.open && <PairingPanel pairing={pair.open.pairing} state={pair.open.state} onCancel={pair.cancel} />}
            {/* kept while a pairing is open (hidden), so a code or a choice is still there after Cancel or a failed join */}
            <div className={pair.open ? 'hidden' : 'flex flex-col gap-8'}>
                {people && <ModeTabs modes={modes} mode={mode} onMode={pickMode} panel="play-mode-panel" />}
                <div className="flex flex-col gap-8" {...(people ? { id: 'play-mode-panel', role: 'tabpanel', 'aria-labelledby': `play-tab-${mode}` } : {})}>
                    {mode === 'bot'
                        ? <Versus opts={opts} bot={bot} onBot={setBot} deck={deck} onDeck={setDeck} botDeck={botDeck} onBotDeck={setBotDeck} busy={busy} error={error} prep={prep} onPlay={go} deckExtra={deckExtra} />
                        : (
                            <div className="grid gap-6 sm:grid-cols-2">
                                {pickDeck('Your deck', deck, setDeck, 'p1', 'play-deck', deckExtra)}
                                <PeopleStart mode={mode} people={opts.people ?? []} deck={deck} joinCode={opts.join ?? ''} error={error} onPair={pair.start} />
                            </div>
                        )}
                </div>
            </div>
            {!people && <p className="text-xs text-dim text-center max-w-xl mx-auto">{table.note ?? 'You sit at seat 1 with the real rules engine. The bot sees only what its seat sees: your hand and both decks stay hidden from it. Every game is saved as a replay.'}</p>}
            {opts.notice && <p className={`text-xs text-dim${people ? '' : ' text-center max-w-xl mx-auto'}`}>{opts.notice}</p>}
        </div>
    );
}

interface Shown { prev: Snapshot | null; cur: Snapshot; n: number }

const BOT_MOVE_MS = 550;
/** a move made by touch waits this long, with an Undo button, before it goes to the table */
const TAKE_BACK_MS = 1500;
/** a decision with only one answer gives it by itself after this long, unless the person stops it */
const AUTO_MS = 2000;
/** the other side's moves since the person's last one, drawn on the board (BoardLines) */
const TRAIL = 4;
/** after a new decision shows, keys wait this long before they act, so a key meant for the last one can't answer it */
const ARM_MS = 250;

/**
 * A move waiting to go to the table: one made by touch (TAKE_BACK_MS), or the only answer to a decision (auto,
 * AUTO_MS). Undo drops it and the decision stays open; a stopped auto answer does not start again.
 */
interface Held { seq: number; a: Action; split?: { id: string; amount: number }[]; text: string; auto?: boolean }

function Table({ id, seat, bot, onLeave }: { id: string; seat: Seat; bot: string; onLeave: () => void }) {
    const table = useContext(TableContext);
    const settings = useMemo(() => createSettingsStore(null, { perspective: seat }), [seat]);
    const [hello, setHello] = useState<HelloMsg | null>(null);
    const [shown, setShown] = useState<Shown | null>(null);
    const [log, setLog] = useState<Omit<MoveMsg, 'state'>[]>([]);
    const [decide, setDecide] = useState<DecideMsg | null>(null);
    const [end, setEnd] = useState<EndMsg | null>(null);
    const [down, setDown] = useState(false);
    const [sending, setSending] = useState(false);
    const [held, setHeld] = useState<Held | null>(null);
    const heldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // the last decision whose only answer was given by itself: a stopped (or refused) one waits for the person
    const autoSeq = useRef(-1);
    const [auto, setAuto] = useAutoAnswer();
    const [trail, setTrail] = useState<Trail[]>([]);
    const boardRef = useRef<HTMLDivElement>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [focus, setFocus] = useState<Focus | null>(null);
    // the pointer or the keys let go of a card; a card a tap opened stays open until it is closed
    const unlook = useCallback(() => setFocus((f) => (f?.touch ? f : null)), []);
    const closeLook = useCallback(() => setFocus(null), []);
    const [help, setHelp] = useState(false);
    const [hints] = useKeyHints();
    const queue = useRef<TableMsg[]>([]);
    const pumping = useRef(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const splitApi = useRef<SplitApi | null>(null);
    // the board's middle, where the prompt bar is drawn (a portal, so the memoised board doesn't redraw for the bar)
    const [centerEl, setCenterEl] = useState<HTMLDivElement | null>(null);
    const center = useMemo(() => <div className="play-center" ref={setCenterEl} />, []);
    useDockTop(rootRef);

    // messages are shown in order; the bot's moves one at a time, so each one animates and can be read
    const pump = useCallback(() => {
        if (pumping.current) {
            return;
        }
        pumping.current = true;
        const next = () => {
            const m = queue.current.shift();
            if (!m) {
                pumping.current = false;
                return;
            }
            let wait = 0;
            if (m.t === 'hello') {
                setHello(m);
            } else if (m.t === 'move') {
                const snap = toSnapshot(m.state, seat);
                setShown((s) => ({ prev: s?.cur ?? null, cur: snap, n: (s?.n ?? 0) + 1 }));
                const { state: _state, ...entry } = m;
                setLog((l) => [entry, ...l].slice(0, 60));
                // the other side's moves since the person's own last one
                setTrail((t) => (m.seat === seat ? [] : [...t, { id: m.card?.id, text: logText(m) }].slice(-TRAIL)));
                // catching up after a reload or a long wait: no pauses
                wait = m.seat !== seat && queue.current.length < 8 ? BOT_MOVE_MS : 0;
            } else if (m.t === 'decide') {
                const snap = toSnapshot(m.state, seat);
                setShown((s) => (s && JSON.stringify(s.cur) === JSON.stringify(snap) ? s : { prev: s?.cur ?? null, cur: snap, n: (s?.n ?? 0) + 1 }));
                setDecide(m);
                setSending(false);
                setProblem(null);
            } else if (m.t === 'end') {
                setDecide(null);
                setEnd(m);
            }
            if (wait) {
                setTimeout(next, wait);
            } else {
                next();
            }
        };
        next();
    }, [seat]);

    useEffect(() => table.follow(id, (m) => {
        queue.current.push(m);
        pump();
    }, setDown), [table, id, pump]);

    // what this table shows, for a host page's feedback box (kit/feedback.ts): read when the person opens it
    const onScreen = useRef<Record<string, unknown> | null>(null);
    onScreen.current = {
        kind: 'play', game: id, seat, bot, step: shown?.n ?? 0, round: shown?.cur.round ?? null, phase: shown?.cur.phase ?? null,
        prompt: decide ? { text: promptText(decide), title: decide.prompt.promptTitle ?? decide.prompt.title, choices: decide.actions.map((a) => a.label) } : null,
        sending, held: held?.text ?? null, problem, down, end: end ? { winner: end.winner, outcome: end.outcome, error: end.error } : null,
        moves: log.slice(0, 8).map((m) => ({ n: m.n, seat: m.seat, label: m.label })), board: shown?.cur ?? null
    };
    useEffect(() => reportOnScreen(() => onScreen.current), []);

    const send = useCallback(async (seq: number, a: Action, split?: { id: string; amount: number }[]) => {
        setSending(true);
        setProblem(null);
        // the person's own move ends the other side's trail
        setTrail([]);
        try {
            await table.act(id, { t: 'act', seq, i: a.i, ...(split ? { split } : {}) });
            // the next decision may already be here (it can arrive before this answer's reply does)
            setDecide((d) => (d && d.seq === seq ? null : d));
        } catch (e) {
            setProblem(String((e as Error).message ?? e));
            setSending(false);
        }
    }, [id, table]);

    /**
     * Answer the decision; `hold` (a move made by touch) waits TAKE_BACK_MS first, with an Undo button, and `auto` (the
     * decision's only answer, given by itself) waits AUTO_MS.
     */
    const act = useCallback((a: Action, split?: { id: string; amount: number }[], hold = false, auto = false) => {
        if (!decide || sending || held) {
            return;
        }
        setFocus((f) => (f?.touch ? null : f));
        if (!hold && !auto) {
            void send(decide.seq, a, split);
            return;
        }
        const h: Held = { seq: decide.seq, a, split, text: moveText(a, decide), auto };
        setHeld(h);
        heldTimer.current = setTimeout(() => {
            heldTimer.current = null;
            setHeld(null);
            void send(h.seq, h.a, h.split);
        }, auto ? AUTO_MS : TAKE_BACK_MS);
    }, [decide, sending, held, send]);
    const undo = useCallback(() => {
        if (heldTimer.current) {
            clearTimeout(heldTimer.current);
            heldTimer.current = null;
        }
        setHeld(null);
    }, []);
    const sendNow = useCallback(() => {
        if (held) {
            undo();
            void send(held.seq, held.a, held.split);
        }
    }, [held, undo, send]);
    // a game that ends (a concession, the other side leaving) drops a waiting move, and so does leaving the table
    useEffect(() => {
        if (end) {
            undo();
        }
    }, [end, undo]);
    useEffect(() => undo, [undo]);
    // a new decision closes a card a tap opened: its moves were the last decision's
    useEffect(() => setFocus((f) => (f?.touch ? null : f)), [decide?.seq]);
    // a decision with one answer gives it by itself after AUTO_MS, once: outside the action window (a lone Pass there
    // is a big move), with no split to make and no cards shown to read; Stop (undo) leaves it to the person
    const lone = auto && decide && !decide.prompt.actionWindow && !decide.prompt.cards?.length && decide.actions.length === 1 && decide.actions[0].kind !== 'distribute' ? decide.actions[0] : null;
    useEffect(() => {
        if (lone && decide && !end && !sending && !held && autoSeq.current !== decide.seq) {
            autoSeq.current = decide.seq;
            act(lone, undefined, false, true);
        }
    }, [lone, decide, end, sending, held, act]);
    const stopAuto = useCallback(() => {
        undo();
        setAuto(false);
    }, [undo, setAuto]);

    const cur = shown?.cur ?? null;
    const ids = useMemo(() => {
        if (!shown) {
            return null;
        }
        const steps = (shown.prev ? [shown.prev, shown.cur] : [shown.cur]).map((state, n) => ({ t: 'step' as const, n, state }));
        return trackUnits({ header: { t: 'header', v: 1, seed: 0, engine: null, players: [] }, steps, end: null });
    }, [shown]);

    // what the board can click: card actions by card id, display picks by the shown card's id
    const picks = useMemo(() => {
        const by = new Map<string, Action>();
        for (const a of decide?.actions ?? []) {
            const cid = a.kind === 'card' ? a.card?.id : a.kind === 'displayCard' ? String(a.arg) : undefined;
            if (cid && cid !== 'hidden' && !by.has(cid)) {
                by.set(cid, a);
            }
        }
        return by;
    }, [decide]);
    const selected = useMemo(() => new Set(decide?.prompt.selected ?? []), [decide]);
    // a damage, healing or token split: its targets glow too, and a click (or the target's key) puts one more there
    const splitIds = useMemo(() => new Set(decide?.actions.find((a) => a.kind === 'distribute')?.distribute?.targets.map((t) => t.id) ?? []), [decide]);
    const drawn = useMemo(() => (cur ? drawnIds(cur, seat) : new Set<string>()), [cur, seat]);
    const asking = useMemo(() => askingCard(decide, cur, seat), [decide, cur, seat]);
    // the cards on the board that answer the asking card's question: BoardLines joins them to it
    const answers = useMemo(() => (asking ? [...picks.keys(), ...splitIds].filter((cid) => cid !== asking && drawn.has(cid)) : []), [asking, picks, splitIds, drawn]);
    const keys = useMemo(() => playKeys(decide, cur, seat, drawn), [decide, cur, seat, drawn]);
    // the keyboard (play/keys.ts): keys wait ARM_MS after each new decision, so a key meant for the last one misses
    const armed = useRef(0);
    useEffect(() => {
        armed.current = performance.now() + ARM_MS;
    }, [decide?.seq]);
    const pick = useMemo((): Pick => ({
        state: (cid) => (picks.has(cid) ? (selected.has(cid) ? 'picked' : 'pick') : selected.has(cid) ? 'picked' : splitIds.has(cid) ? 'pick' : null),
        pick: (cid, hold = false) => {
            const a = picks.get(cid);
            if (a) {
                act(a, undefined, hold);
            } else if (splitIds.has(cid)) {
                splitApi.current?.add(cid);
            }
        },
        keyOf: (cid) => (hints ? keys.card.get(cid) ?? null : null),
        keyReady: () => performance.now() >= armed.current,
        // one more on a split target: the split panel takes it back, so a tap places it at once
        instant: (cid) => !picks.has(cid) && splitIds.has(cid),
        move: (cid) => {
            const a = picks.get(cid);
            if (a && decide) {
                return { icon: moveIcon(a, decide), label: moveVerb(a, decide) };
            }
            return splitIds.has(cid) ? { icon: 'add', label: `One more ${decide?.actions.find((x) => x.kind === 'distribute')?.distribute?.type ?? ''} on`.replace(/\s+/g, ' ') } : null;
        },
        dud: (cid) => {
            const a = picks.get(cid);
            return !!a && isDud(a);
        },
        asking
    }), [picks, selected, splitIds, act, hints, keys, decide, asking]);
    // while a touch move waits to go, nothing glows, and its card shows the countdown (a tap on it takes the move back)
    const waiting = useMemo((): Pick | null => (held ? { state: () => null, pick: () => undefined, held: actionCardId(held.a) ?? null, undo } : null), [held, undo]);

    // the page's keys while this table is on screen and nothing is being typed
    const now = useRef({ keys, decide, sending, act, pick, end, help, held, undo, sendNow });
    now.current = { keys, decide, sending, act, pick, end, help, held, undo, sendNow };
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const s = now.current;
            const root = rootRef.current;
            const target = (e.composedPath?.()[0] ?? e.target) as HTMLElement | null;
            // a hidden table (a host page showing a replay over it) takes no keys
            if (!root || !root.getClientRects().length || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(target)) {
                return;
            }
            if (e.key === '?') {
                e.preventDefault();
                setHelp((h) => !h);
                return;
            }
            // a move waiting to go: Esc or Backspace takes it back, Space or Enter sends it now, nothing else acts
            if (s.held && !s.help) {
                if (e.key === 'Escape' || e.key === 'Backspace') {
                    e.preventDefault();
                    s.undo();
                } else if ((e.key === ' ' || e.key === 'Enter') && !target?.closest?.(CONTROL)) {
                    e.preventDefault();
                    if (!e.repeat) {
                        s.sendNow();
                    }
                }
                return;
            }
            const ready = () => !e.repeat && !!s.decide && !s.sending && performance.now() >= armed.current;
            if (e.key === 'Escape') {
                const active = (root.getRootNode() as Document | ShadowRoot).activeElement as HTMLElement | null;
                if (s.help) {
                    setHelp(false);
                } else if (active?.classList.contains('card') && root.contains(active)) {
                    active.blur();
                } else if (s.keys.cancel && ready()) {
                    s.act(s.keys.cancel);
                }
                return;
            }
            if (s.help) {
                return;
            }
            const k = eventKey(e);
            if (s.end) {
                const el = root.querySelector<HTMLElement>(`[data-hotkey="${k}"]`);
                if (el && !e.repeat) {
                    e.preventDefault();
                    el.click();
                }
                return;
            }
            if (e.key === ' ' || e.key === 'Enter') {
                if (target?.closest?.(CONTROL)) {
                    return;
                }
                e.preventDefault();
                if (ready()) {
                    if (s.keys.split) {
                        splitApi.current?.confirm();
                    } else if (s.keys.primary) {
                        s.act(s.keys.primary);
                    }
                }
                return;
            }
            if (e.key === 'Backspace' && s.keys.split) {
                e.preventDefault();
                if (ready()) {
                    splitApi.current?.undo();
                }
                return;
            }
            if (e.code === 'Slash' && !e.shiftKey) {
                const search = root.querySelector<HTMLElement>('[data-key-search]');
                if (search) {
                    e.preventDefault();
                    search.focus();
                }
                return;
            }
            const t = s.keys.byKey.get(k);
            if (!t) {
                return;
            }
            e.preventDefault();
            if (t.kind === 'card' && e.shiftKey && !k.startsWith('Shift+')) {
                // look without picking (⇧ + a letter): the card takes focus, so it shows enlarged; Enter then picks it,
                // Esc lets go. ⇧ + a digit is a key of its own (choices 11 to 20), so it picks
                root.querySelector<HTMLElement>(`.card[data-effect-id="${CSS.escape(t.id)}"]`)?.focus();
            } else if (ready()) {
                if (t.kind === 'act') {
                    s.act(t.action);
                } else {
                    s.pick.pick(t.id);
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const names: Record<Seat, string> = seat === 'p1' ? { p1: 'You', p2: bot } : { p1: bot, p2: 'You' };
    const youDeck = hello?.deck.metadata?.name;
    const botDeck = hello?.opponent.metadata?.name;
    const actor: Seat | null = end ? null : decide ? seat : seat === 'p1' ? 'p2' : 'p1';
    const live = decide && !sending && !held;
    const zoomKey = focus ? `${focus.card.n}:${focus.rect?.left}:${focus.rect?.top}` : '';

    return (
        <SettingsProvider store={settings}>
            <div ref={rootRef} className="play flex flex-col min-h-[calc(100vh-3rem)]" style={{ '--take-back': `${TAKE_BACK_MS}ms` } as CSSProperties}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-b border-line text-sm">
                    <span className="font-display font-semibold" style={{ color: `var(--color-${seat})` }}>You</span>
                    <span className="text-faint truncate max-w-[16rem]">{youDeck}</span>
                    <span className="text-faint">vs</span>
                    <span className="font-display font-semibold" style={{ color: `var(--color-${seat === 'p1' ? 'p2' : 'p1'})` }}>{bot}</span>
                    <span className="text-faint truncate max-w-[16rem]">{botDeck}</span>
                    {cur && <span className="text-dim num">Round {cur.round} · {cur.phase}</span>}
                    {down && !end && <span className="text-p2">Reconnecting…</span>}
                    <span className="ml-auto flex gap-2">
                        <KeysButton onClick={() => setHelp(true)} className="play-btn ghost" />
                        {!auto && !end && <button className="play-btn ghost" onClick={() => setAuto(true)} title="Decisions with only one answer wait for you; turn on to have them go by themselves">One-answer moves: ask</button>}
                        {!end && <HoldButton className="play-btn ghost" onGo={() => void table.concede(id)} title="Give up this game"><Flag size={14} /> Concede</HoldButton>}
                    </span>
                </div>
                <div className="flex-1 flex flex-col lg:flex-row min-h-0">
                    <div ref={boardRef} className="relative flex-1 min-w-0 px-2 py-3">
                        {cur && ids ? (
                            <PickContext.Provider value={live ? pick : waiting}>
                                <Board state={cur} prev={shown!.prev} ids={ids[ids.length - 1]} prevIds={shown!.prev ? ids[0] : null} bots={names} actor={actor} step={shown!.n}
                                    onFocus={setFocus} onLeave={unlook} values={false} spots={false} center={center} fanHand={seat} />
                            </PickContext.Provider>
                        ) : <div className="p-8 text-dim flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Shuffling…</div>}
                        {cur && <BoardLines root={boardRef} step={shown!.n} trail={trail} botSeat={seat === 'p1' ? 'p2' : 'p1'}
                            asking={live && !end ? asking : null} answers={answers} question={decide ? promptText(decide) : null} />}
                    </div>
                    <aside className="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-line px-3 py-3 flex flex-col gap-2 max-h-[40vh] lg:max-h-none overflow-auto">
                        <h2 className="text-xs uppercase tracking-[0.12em] text-dim">Moves</h2>
                        <ol className="flex flex-col gap-1 text-[13px]">
                            {log.map((m) => (
                                <li key={m.n} className="flex gap-2 min-w-0">
                                    <span className="num text-faint w-7 shrink-0 text-right">{m.n}</span>
                                    <span className="shrink-0 font-semibold" style={{ color: `var(--color-${m.seat})` }}>{names[m.seat]}</span>
                                    <span className="text-dim truncate" title={m.label}>{logText(m)}</span>
                                </li>
                            ))}
                        </ol>
                    </aside>
                </div>
                {/* a new bar for each decision, so a button focused by a click can't take the next decision's Space */}
                {centerEl && cur && createPortal(
                    <PromptBar key={decide?.seq ?? 'wait'} decide={decide} sending={sending} held={held} onUndo={undo} onSendNow={sendNow} problem={problem} board={cur} bot={bot} drawn={drawn}
                        pick={pick} onAct={act} ended={!!end} keys={keys} hints={hints} splitApi={splitApi} onLook={setFocus} onUnlook={unlook} trail={trail} onStopAuto={stopAuto} />,
                    centerEl
                )}
                {focus && (focus.touch
                    ? (
                        <FloatingZoom key={zoomKey} focus={focus} score={null} onClose={closeLook}>
                            {decide && !end && <CardMoves id={focus.card.id ?? ''} decide={decide} pick={picks.get(focus.card.id ?? '')} disabled={!live} onAct={act} />}
                        </FloatingZoom>
                    )
                    : <FloatingZoom key={zoomKey} focus={focus} score={null} />)}
                {end && <EndCard end={end} seat={seat} bot={bot} id={id} onLeave={onLeave} hints={hints} />}
                {help && <KeyHelp mode="play" seat={seat} onClose={() => setHelp(false)} />}
            </div>
        </SettingsProvider>
    );
}

/**
 * How far down the page's own sticky header reaches (Holotable's nav, or the bar of the page around the kit), as
 * --dock-top on the table, so the prompt bar docks under it rather than over it. Read at y = 1 in the window's middle,
 * skipping the table itself (and the kit's host element, which stands for everything in its shadow root).
 */
function useDockTop(root: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const el = root.current;
        if (!el || typeof document.elementsFromPoint !== 'function') {
            return;
        }
        const host = (el.getRootNode() as ShadowRoot).host ?? null;
        const measure = () => {
            let top = 0;
            for (const hit of document.elementsFromPoint(window.innerWidth / 2, 1)) {
                if (el.contains(hit) || (host && (hit === host || host.contains(hit)))) {
                    continue;
                }
                for (let e: Element | null = hit; e && e !== document.body && !top; e = e.parentElement) {
                    const pos = getComputedStyle(e).position;
                    if (pos === 'sticky' || pos === 'fixed') {
                        top = Math.max(0, Math.round(e.getBoundingClientRect().bottom));
                    }
                }
                if (top) {
                    break;
                }
            }
            el.style.setProperty('--dock-top', `${top}px`);
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [root]);
}

/** The moves of a card a tap opened: one button each, with the decision's words above them. */
function CardMoves({ id, decide, pick, disabled, onAct }: { id: string; decide: DecideMsg; pick: Action | undefined; disabled: boolean; onAct: (a: Action) => void }) {
    const moves = [...(pick ? [pick] : []), ...decide.actions.filter((a) => a.kind === 'perCardButton' && a.cardUuid === id)];
    return (
        <div className="flex flex-col gap-2 border-t border-line pt-2">
            <span className="text-xs text-dim">{promptText(decide)}</span>
            {moves.length > 0
                ? <div className="flex flex-wrap gap-2">{moves.map((a) => <button key={a.i} className={`play-btn primary${isDud(a) ? ' dud' : ''}`} disabled={disabled} onClick={() => onAct(a)}>{moveVerb(a, decide)}{isDud(a) && <span className="dud-note">no effect</span>}</button>)}</div>
                : <span className="text-xs text-faint">No move with this card now.</span>}
        </div>
    );
}

/** A move as a log line. */
function logText(m: Omit<MoveMsg, 'state'>): string {
    if (m.kind === 'distribute' && m.split?.length) {
        return `split ${m.split.reduce((t, e) => t + e.amount, 0)}`;
    }
    if (m.kind === 'card' || m.kind === 'displayCard') {
        return m.label;
    }
    return m.label;
}

/**
 * The card on the board whose ability asks the question now: the one the prompt's title names (forceteki titles a
 * card's prompt with the card), the person's own first. Null in the action window or when no card on the board has
 * that name.
 */
function askingCard(m: DecideMsg | null, s: Snapshot | null, you: Seat): string | null {
    const name = m && !m.prompt.actionWindow ? m.prompt.promptTitle : null;
    if (!name || !s) {
        return null;
    }
    const named = (n: string) => n === name || name.startsWith(`${n},`) || name.startsWith(`${n} - `);
    for (const seat of [you, you === 'p1' ? 'p2' : 'p1'] as Seat[]) {
        const p = s.players[seat];
        const hit = [p.leader, p.base, ...p.ground, ...p.space].find((c) => c?.id && named(c.n));
        if (hit?.id) {
            return hit.id;
        }
    }
    return null;
}

/** The cards the board draws as clickable faces: bases, leaders, your hand and every unit. */
function drawnIds(s: Snapshot, you: Seat): Set<string> {
    const out = new Set<string>();
    for (const seat of ['p1', 'p2'] as Seat[]) {
        const p = s.players[seat];
        for (const c of [p.base, p.leader, ...p.ground, ...p.space, ...(seat === you ? p.hand : [])]) {
            if (c?.id) {
                out.add(c.id);
            }
        }
    }
    return out;
}

/**
 * The decision, drawn between the two sides of the board: what is asked, the cards a prompt shows, a split, and the
 * buttons. While a move made by touch waits to go, it shows that move with Undo instead.
 */
function PromptBar({ decide, sending, held, onUndo, onSendNow, problem, board, bot, drawn, pick, onAct, ended, keys, hints, splitApi, onLook, onUnlook, trail, onStopAuto }: {
    decide: DecideMsg | null; sending: boolean; held: Held | null; onUndo: () => void; onSendNow: () => void; problem: string | null; board: Snapshot | null; bot: string; drawn: Set<string>; pick: Pick;
    onAct: (a: Action, split?: { id: string; amount: number }[]) => void; ended: boolean; keys: PlayKeys; hints: boolean; splitApi: RefObject<SplitApi | null>;
    /** a tray card shown enlarged (hovered, or focused with ⇧ + its key), and let go */
    onLook: (f: Focus | null) => void; onUnlook: () => void;
    /** the other side's moves since the person's last one, as a line of words (BoardLines draws them on the board) */
    trail: Trail[];
    /** stop a one-answer move and turn them off */
    onStopAuto: () => void;
}) {
    const [all, setAll] = useState(false);
    // the key cap a button shows: Space on the main button, the bar's number (or ⇧number) on the others
    const cap = (a: Action): ReactNode => {
        const k = keys.primary?.i === a.i ? 'Space' : keys.act.get(a.i);
        return hints && k ? <Kbd k={k} className="hint" /> : null;
    };
    if (ended) {
        return null;
    }
    // a waiting move shows over the decision, which stays mounted (hidden) so Undo finds a split or a search as it was
    const strip = held && (
        <div className="play-bar held" role="status" aria-label={held.auto ? 'The only answer is about to go' : 'Your move is about to go'}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="flex flex-col min-w-0 flex-1">
                    <span className="text-dim text-xs">{held.auto ? 'The only answer: sending it' : 'Sending in a moment'}</span>
                    <span className="font-display font-semibold text-[15px] truncate">{held.text}</span>
                </span>
                <button className="play-btn primary" onClick={onUndo}>{held.auto ? <><Hand size={15} /> Stop</> : <><Undo2 size={15} /> Undo</>}{hints && <Kbd k="Escape" className="hint" />}</button>
                <button className="play-btn ghost" onClick={onSendNow}><Send size={14} /> Send now</button>
                {held.auto && <button className="play-btn ghost" onClick={onStopAuto} title="One-answer moves wait for you from now on (the bar at the top turns them back on)">Always ask</button>}
            </div>
            <span className="held-clock" style={{ animationDuration: `${held.auto ? AUTO_MS : TAKE_BACK_MS}ms` }} aria-hidden="true" />
        </div>
    );
    // what the other side just did, in words, over the decision it led to
    const said = trail.length > 0 && (
        <span className="trail-line" title={trail.map((t) => t.text).join(' → ')}><b>{bot}:</b> {trail.map((t) => t.text).join(' → ')}</span>
    );
    if (!decide) {
        return strip || (
            <div className="play-bar waiting">
                <span className="flex items-center gap-2 text-dim">{sending ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : <><Loader2 size={15} className="animate-spin" /> {bot} is thinking…</>}</span>
                {!sending && said}
            </div>
        );
    }
    const acts = decide.actions;
    const buttons = acts.filter((a) => a.kind === 'button');
    const options = acts.filter((a) => a.kind === 'option');
    const dist = acts.find((a) => a.kind === 'distribute');
    const tray = decide.prompt.cards ?? [];
    const trayIds = new Set(tray.map((c) => c.id));
    const elsewhere = acts.filter((a) => a.kind === 'card' && (a.card?.id === 'hidden' || !drawn.has(a.card?.id ?? '')) && !trayIds.has(a.card?.id ?? ''));
    const glowing = acts.some((a) => a.kind === 'card' && a.card && drawn.has(a.card.id));
    return (
        <>
            {strip}
            <div className="play-bar" role="region" aria-label="Your decision" data-seq={decide.seq} hidden={!!held}>
                {said}
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-display font-semibold text-[15px]">{promptText(decide)}</span>
                    {glowing && <span className="text-dim text-xs no-touch">Click a glowing card{hints ? <span className="keys-only"> or press its key</span> : ''}, or choose below.</span>}
                    {glowing && <span className="text-dim text-xs touch-only">Tap an icon on a card to make that move, or tap the card to read it.</span>}
                    {problem && <span className="text-p2 text-xs">{problem}</span>}
                </div>
                {tray.length > 0 && (
                    <div className="flex flex-wrap gap-3 items-start">
                        {tray.map((c) => {
                            const per = acts.filter((a) => a.kind === 'perCardButton' && a.cardUuid === c.id);
                            return (
                                <div key={c.id} className={`flex flex-col items-center gap-1 ${c.st === 'unselectable' || c.st === 'invalid' ? 'opacity-50' : ''}`}>
                                    <PickContext.Provider value={pick}>
                                        <Card card={c} size="sm" kind="hand" onFocus={onLook} onLeave={onUnlook} />
                                    </PickContext.Provider>
                                    <span className="text-[11px] text-dim max-w-[6rem] truncate" title={c.n}>{c.n}</span>
                                    {per.map((a) => <button key={a.i} className="play-btn small" disabled={sending} onClick={() => onAct(a)}>{a.label.split(':')[0]}{cap(a)}</button>)}
                                </div>
                            );
                        })}
                    </div>
                )}
                {dist && <SplitPanel key={decide.seq} action={dist} d={dist.distribute!} board={board} sending={sending} onAct={onAct} api={splitApi}
                    keyOf={(cid) => (hints ? keys.card.get(cid) ?? null : null)} hints={hints} />}
                <div className="flex flex-wrap gap-2 items-center">
                    {elsewhere.map((a) => (
                        <button key={a.i} className="play-btn" disabled={sending} onClick={() => onAct(a)} title={a.card?.zone ? `In ${zoneName(a.card.zone)}` : undefined}>
                            {a.card?.id === 'hidden' ? 'A hidden card' : a.card?.n ?? a.label}{a.card?.zone ? <span className="text-faint text-xs ml-1">{zoneName(a.card.zone)}</span> : null}{cap(a)}
                        </button>
                    ))}
                    {options.length > 0 && <Options options={options} sending={sending} onAct={onAct} cap={cap} />}
                    {buttons.map((a) => {
                        const cls = `play-btn${PRIMARY.test(a.label) ? ' primary' : ''}${isDud(a) ? ' dud' : ''}`;
                        // a move that ends the person's options for now: a finger holds it (HoldButton), a click goes at once
                        return bigMove(a, decide)
                            ? <HoldButton key={a.i} className={cls} disabled={sending} onGo={() => onAct(a)}>{words(a)}{cap(a)}</HoldButton>
                            : <button key={a.i} className={cls} disabled={sending} onClick={() => onAct(a)}>{words(a)}{cap(a)}</button>;
                    })}
                    <button className="play-btn ghost ml-auto" onClick={() => setAll((x) => !x)} aria-expanded={all}>{all ? 'Hide' : 'All'} moves ({acts.length})</button>
                </div>
                {all && (
                    <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
                        {acts.map((a) => <button key={a.i} className={`play-btn small${isDud(a) ? ' dud' : ''}`} disabled={sending} onClick={() => onAct(a)}>{actionText(a)}</button>)}
                    </div>
                )}
            </div>
        </>
    );
}

/** A choice's words; one that would change nothing says so after them (the button also gets .dud). */
function words(a: Action): ReactNode {
    const { text } = noEffectText(a.label.replace(/^#/, ''));
    return isDud(a) ? <>{text}<span className="dud-note">no effect</span></> : text;
}

/** Pass and the claims (Claim Initiative) in the action window end the person's options for now: a finger holds them. */
const bigMove = (a: Action, m: DecideMsg) => a.kind === 'button' && !!m.prompt.actionWindow && /^(pass|claim\b)/i.test(a.label);

/** how long a finger holds a big move (HoldButton) */
const HOLD_MS = 450;

/**
 * A button for a move that can't be taken back and ends the person's options for now (Pass, Claim Initiative,
 * Concede). A finger holds it while a ring fills, and it goes when the ring is full; a shorter tap only says "Hold".
 * A mouse click or a key goes at once, as any button.
 */
function HoldButton({ onGo, className, disabled, title, children }: { onGo: () => void; className: string; disabled?: boolean; title?: string; children: ReactNode }) {
    const [filling, setFilling] = useState(false);
    const [hint, setHint] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // a finger pressed it: the click that follows its lifting is not a move
    const finger = useRef(false);
    const stop = useCallback(() => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        setFilling(false);
    }, []);
    useEffect(() => () => {
        stop();
        if (hintTimer.current) {
            clearTimeout(hintTimer.current);
        }
    }, [stop]);
    const early = () => {
        if (!timer.current) {
            return;
        }
        stop();
        setHint(true);
        if (hintTimer.current) {
            clearTimeout(hintTimer.current);
        }
        hintTimer.current = setTimeout(() => setHint(false), 1500);
    };
    return (
        <button className={`${className} hold-btn${filling ? ' filling' : ''}`} disabled={disabled} title={title} style={{ '--hold': `${HOLD_MS}ms` } as CSSProperties}
            onPointerDown={(e) => {
                finger.current = e.pointerType === 'touch';
                if (!finger.current || disabled) {
                    return;
                }
                setHint(false);
                setFilling(true);
                timer.current = setTimeout(() => {
                    timer.current = null;
                    setFilling(false);
                    onGo();
                }, HOLD_MS);
            }}
            onPointerUp={early} onPointerCancel={stop} onPointerLeave={stop} onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => {
                // detail 0: a key pressed the button
                if (finger.current && e.detail !== 0) {
                    finger.current = false;
                    return;
                }
                onGo();
            }}>
            {children}
            <span className="hold-fill" aria-hidden="true" />
            {hint && <span className="hold-hint" role="status">Hold</span>}
        </button>
    );
}

const AUTO_KEY = 'holotable.autoAnswer';

/** Whether a decision with one answer gives it by itself (on unless the person said "Always ask"), saved in the browser. */
function useAutoAnswer(): [boolean, (on: boolean) => void] {
    const [on, setOn] = useState(() => {
        try {
            return localStorage.getItem(AUTO_KEY) !== 'off';
        } catch {
            return true;
        }
    });
    const set = useCallback((v: boolean) => {
        setOn(v);
        try {
            localStorage.setItem(AUTO_KEY, v ? 'on' : 'off');
        } catch {
            // storage blocked: the switch lasts until the page closes
        }
    }, []);
    return [on, set];
}

const ZONES: Record<string, string> = { groundArena: 'ground', spaceArena: 'space', resource: 'resources', discard: 'discard', hand: 'hand', deck: 'deck', base: 'base', capture: 'captured', outsideTheGame: 'set aside' };
const zoneName = (z: string) => ZONES[z] ?? z;

function actionText(a: Action): string {
    if (a.kind === 'card') {
        return a.card?.id === 'hidden' ? 'A hidden card' : `${a.card?.n ?? a.label}${a.card?.zone ? ` (${zoneName(a.card.zone)})` : ''}`;
    }
    if (a.kind === 'distribute') {
        return `${a.label} (random split)`;
    }
    if (a.kind === 'perCardButton') {
        const [what, ...rest] = a.label.split(':');
        return `${what}: ${rest.join(':')}`;
    }
    return a.label;
}

/** Numbers and short menus as buttons; a long list (name a card: about 1,900 entries) as a search box. */
function Options({ options, sending, onAct, cap }: { options: Action[]; sending: boolean; onAct: (a: Action) => void; cap: (a: Action) => ReactNode }) {
    const [q, setQ] = useState('');
    if (options.length <= 16) {
        return <>{options.map((a) => <button key={a.i} className={`play-btn${isDud(a) ? ' dud' : ''}`} disabled={sending} onClick={() => onAct(a)}>{words(a)}{cap(a)}</button>)}</>;
    }
    const hits = q.trim() ? options.filter((a) => a.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 24) : [];
    return (
        <div className="flex flex-col gap-1.5 w-full">
            {/* / jumps here; Enter takes the first match, Esc leaves the box */}
            <input className="play-select max-w-sm" placeholder={`Search ${options.length} choices (/)`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the choices"
                data-key-search="" aria-keyshortcuts="/" onKeyDown={(e) => {
                    if (e.key === 'Enter' && hits.length && !sending) {
                        e.preventDefault();
                        onAct(hits[0]);
                    } else if (e.key === 'Escape') {
                        e.currentTarget.blur();
                    }
                }} />
            <div className="flex flex-wrap gap-1.5">{hits.map((a) => <button key={a.i} className="play-btn small" disabled={sending} onClick={() => onAct(a)}>{a.label}</button>)}</div>
        </div>
    );
}

/** What the keys (and clicks on the board) do to an open split. */
interface SplitApi { add: (id: string) => void; undo: () => void; confirm: () => void }

/** Split damage, healing or tokens: a stepper per target, sent only when it adds up. */
function SplitPanel({ action, d, board, sending, onAct, api, keyOf, hints }: {
    action: Action; d: Distribute; board: Snapshot | null; sending: boolean; onAct: (a: Action, split?: { id: string; amount: number }[]) => void;
    api: RefObject<SplitApi | null>; keyOf: (id: string) => string | null; hints: boolean;
}) {
    // each one placed, oldest first, so Backspace takes back the last
    const [st, setSt] = useState<{ amounts: Record<string, number>; order: string[] }>({ amounts: {}, order: [] });
    const { amounts } = st;
    const split = d.targets.map((t) => ({ id: t.id, amount: amounts[t.id] ?? 0 })).filter((e) => e.amount > 0);
    const total = split.reduce((t, e) => t + e.amount, 0);
    const why = splitProblem(d, split);
    const name = (cid: string): CardRef | null => (board ? cardById(board, cid) : null);
    const bump = (cid: string, by: 1 | -1) => setSt((s) => {
        const t = d.targets.find((x) => x.id === cid);
        const v = s.amounts[cid] ?? 0;
        const placed = Object.values(s.amounts).reduce((n, x) => n + x, 0);
        if (!t || (by > 0 ? placed >= d.amount || (t.cap !== null && v >= t.cap) : v === 0)) {
            return s;
        }
        const last = s.order.lastIndexOf(cid);
        return { amounts: { ...s.amounts, [cid]: v + by }, order: by > 0 ? [...s.order, cid] : [...s.order.slice(0, last), ...s.order.slice(last + 1)] };
    });
    const confirm = () => {
        if (!sending && !why) {
            onAct(action, split);
        }
    };
    // the panel on screen answers the keys; a panel going away lets go only of its own handle (the next split's may be in)
    useLayoutEffect(() => {
        const mine: SplitApi = {
            add: (cid) => bump(cid, 1),
            undo: () => setSt((s) => {
                const cid = s.order[s.order.length - 1];
                return cid ? { amounts: { ...s.amounts, [cid]: (s.amounts[cid] ?? 1) - 1 }, order: s.order.slice(0, -1) } : s;
            }),
            confirm
        };
        api.current = mine;
        return () => {
            if (api.current === mine) {
                api.current = null;
            }
        };
    });
    return (
        <div className="flex flex-col gap-2 border border-line rounded-lg p-2.5 bg-ink/60">
            <span className="text-sm">Split <b className="num">{d.amount}</b> {d.tokenType ?? d.type}: <span className={why ? 'text-gold' : 'text-good'}>{total} placed{why ? ` · ${why}` : ''}</span>
                {hints && <span className="text-faint text-xs ml-2">Click a glowing card or press its key for one more; <Kbd k="Backspace" className="hint" /> takes the last back.</span>}</span>
            <div className="flex flex-wrap gap-2">
                {d.targets.map((t) => {
                    const c = name(t.id);
                    const v = amounts[t.id] ?? 0;
                    const k = keyOf(t.id);
                    return (
                        <div key={t.id} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1">
                            {k && <Kbd k={k} className="hint" />}
                            <span className="text-[13px] max-w-[9rem] truncate" title={c?.n ?? t.id}>{c?.n ?? t.id}</span>
                            <button className="play-icon" aria-label={`One less on ${c?.n ?? t.id}`} onClick={() => bump(t.id, -1)} disabled={v === 0}><Minus size={13} /></button>
                            <span className="num w-5 text-center">{v}</span>
                            <button className="play-icon" aria-label={`One more on ${c?.n ?? t.id}`} onClick={() => bump(t.id, 1)} disabled={(t.cap !== null && v >= t.cap) || total >= d.amount}><Plus size={13} /></button>
                        </div>
                    );
                })}
            </div>
            <div className="flex gap-2">
                <button className="play-btn primary" disabled={sending || !!why} onClick={confirm}>Confirm split{hints && <Kbd k="Space" className="hint" />}</button>
                <button className="play-btn ghost" disabled={sending} onClick={() => setSt({ amounts: {}, order: [] })}><RotateCcw size={13} /> Reset</button>
            </div>
        </div>
    );
}

function EndCard({ end, seat, bot, id, onLeave, hints }: { end: EndMsg; seat: Seat; bot: string; id: string; onLeave: () => void; hints: boolean }) {
    const table = useContext(TableContext);
    const watch = table.watch(id);
    const download = end.replay ? table.replayUrl(id) : null;
    const won = end.winner === seat;
    // the end's choices take the number keys, like the bar's
    const cap = (k: string) => (hints ? <Kbd k={k} className="hint" /> : null);
    const { head, detail } = endText(end, seat, bot);
    return (
        <div className="play-end" role="dialog" aria-label="Game over">
            <div className="flex flex-col gap-3 items-start">
                <span className="font-display text-2xl font-bold" style={{ color: won ? 'var(--color-good)' : 'var(--color-p2)' }}>{head}</span>
                <span className="text-dim text-sm">{detail}</span>
                <div className="flex flex-wrap gap-2">
                    <button className="play-btn primary" onClick={onLeave} data-hotkey="Digit1"><Play size={14} /> Play again{cap('Digit1')}</button>
                    {typeof watch === 'string' && <a className="play-btn" href={watch} data-hotkey="Digit2">Watch the replay{cap('Digit2')}</a>}
                    {typeof watch === 'function' && <button className="play-btn" onClick={watch} data-hotkey="Digit2">Watch the replay{cap('Digit2')}</button>}
                    {download && <a className="play-btn ghost" href={download} download={`${id}.jsonl`} data-hotkey="Digit3">Download replay{cap('Digit3')}</a>}
                </div>
            </div>
        </div>
    );
}
