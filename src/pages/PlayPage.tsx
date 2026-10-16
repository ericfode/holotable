import { useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Flag, Loader2, Minus, Play, Plus, RotateCcw } from 'lucide-react';
import { Board } from '../components/Board';
import { Card, type Focus } from '../components/Card';
import { FloatingZoom } from '../components/CardZoom';
import { cardById, trackUnits } from '../data/derive';
import type { CardRef, Seat, Snapshot } from '../data/types';
import { cardTextBySet } from '../lib/cardText';
import { createSettingsStore, SettingsProvider } from '../lib/settings';
import { hashParam } from '../lib/route';
import { PickContext, type Pick } from '../play/pick';
import { TableContext, type DeckOption, type TableOptions } from '../play/client';
import { firstMode, startModes, type StartMode } from '../play/modes';
import { OpponentPicker } from '../play/OpponentPicker';
import { endText, promptText, splitProblem, toSnapshot, type Action, type DecideMsg, type Distribute, type EndMsg, type HelloMsg, type MoveMsg, type TableMsg } from '../play/protocol';
import { DeckImport, ModeTabs, PairingPanel, PeopleStart, usePairing } from '../play/StartModes';

/**
 * Play mode (#/play): a person sits at a table (the arena's bot/table) against a bot. The board is the replay board
 * drawn from the person's seat; every legal move is a glowing card, a button in the prompt bar, or an entry in
 * "All moves", so no prompt can leave the person stuck. The table checks every answer again. The table is the
 * TableContext's (play/client.ts): the HTTP table by default, or the host page's (the viewer kit's mountPlay), which
 * may also pair the person with another person (the open-tables start screen) and add decks.
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
    const pair = usePairing(table, onStart, setError);
    useEffect(() => {
        table.options().then((o) => {
            setOpts(o);
            setBot(o.bots[0] ?? '');
            setDeck(o.decks.find((d) => d.name !== o.botDeck)?.name ?? o.decks[0]?.name ?? '');
            setBotDeck(o.botDeck);
            setMode(firstMode(startModes(o, !!table.pair), o.join));
        }, (e) => setError(String(e.message ?? e)));
    }, [table]);
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
    return (
        <div className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-8">
            <header className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.16em] text-gold font-mono">Play mode</span>
                <h1 className="font-display text-3xl font-bold">{people ? 'Open tables' : 'Play against a bot'}</h1>
                {opts.you && <span className="text-xs text-dim">You play as <span className="font-mono text-fg">{opts.you}</span></span>}
                <p className="text-dim max-w-xl">{table.note ?? (people ? 'Play another person or a bot on the real rules engine. Each side sees only its own seat: your hand and your deck stay hidden from the other.' : 'You sit at seat 1 with the real rules engine. The bot sees only what its seat sees: your hand and both decks stay hidden from it. Every game is saved as a replay.')}</p>
            </header>
            {pair.open && <PairingPanel pairing={pair.open.pairing} state={pair.open.state} onCancel={pair.cancel} />}
            {/* kept while a pairing is open (hidden), so a code or a choice is still there after Cancel or a failed join */}
            <div className={pair.open ? 'hidden' : 'flex flex-col gap-8'}>
                {people && <ModeTabs modes={modes} mode={mode} onMode={pickMode} panel="play-mode-panel" />}
                <div className="flex flex-col gap-8" {...(people ? { id: 'play-mode-panel', role: 'tabpanel', 'aria-labelledby': `play-tab-${mode}` } : {})}>
                    {mode === 'bot' && <OpponentPicker opts={opts} bot={bot} onBot={setBot} />}
                    <div className="grid gap-6 sm:grid-cols-2">
                        {pickDeck('Your deck', deck, setDeck, 'p1', 'play-deck', importDeck && <DeckImport onImport={importDeck} onAdded={added} />)}
                        {mode === 'bot'
                            ? pickDeck("The bot's deck", botDeck, setBotDeck, 'p2', 'play-bot-deck')
                            : <PeopleStart mode={mode} people={opts.people ?? []} deck={deck} joinCode={opts.join ?? ''} error={error} onPair={pair.start} />}
                    </div>
                    {mode === 'bot' && <div className="flex items-center gap-3">
                        <button className="play-btn primary" onClick={go} disabled={busy || !bot || !deck}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Sit down</button>
                        {error && <span className="text-p2 text-sm">{error}</span>}
                    </div>}
                </div>
            </div>
            {opts.notice && <p className="text-xs text-dim">{opts.notice}</p>}
        </div>
    );
}

interface Shown { prev: Snapshot | null; cur: Snapshot; n: number }

const BOT_MOVE_MS = 550;

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
    const [problem, setProblem] = useState<string | null>(null);
    const [focus, setFocus] = useState<Focus | null>(null);
    const queue = useRef<TableMsg[]>([]);
    const pumping = useRef(false);

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

    const act = useCallback(async (a: Action, split?: { id: string; amount: number }[]) => {
        if (!decide || sending) {
            return;
        }
        setSending(true);
        setProblem(null);
        try {
            const seq = decide.seq;
            await table.act(id, { t: 'act', seq, i: a.i, ...(split ? { split } : {}) });
            // the next decision may already be here (it can arrive before this answer's reply does)
            setDecide((d) => (d && d.seq === seq ? null : d));
        } catch (e) {
            setProblem(String((e as Error).message ?? e));
            setSending(false);
        }
    }, [decide, sending, id, table]);

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
    const pick = useMemo((): Pick => ({
        state: (cid) => (picks.has(cid) ? (selected.has(cid) ? 'picked' : 'pick') : selected.has(cid) ? 'picked' : null),
        pick: (cid) => {
            const a = picks.get(cid);
            if (a) {
                void act(a);
            }
        }
    }), [picks, selected, act]);

    const names: Record<Seat, string> = seat === 'p1' ? { p1: 'You', p2: bot } : { p1: bot, p2: 'You' };
    const youDeck = hello?.deck.metadata?.name;
    const botDeck = hello?.opponent.metadata?.name;
    const actor: Seat | null = end ? null : decide ? seat : seat === 'p1' ? 'p2' : 'p1';

    return (
        <SettingsProvider store={settings}>
            <div className="play flex flex-col min-h-[calc(100vh-3rem)]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-b border-line text-sm">
                    <span className="font-display font-semibold" style={{ color: `var(--color-${seat})` }}>You</span>
                    <span className="text-faint truncate max-w-[16rem]">{youDeck}</span>
                    <span className="text-faint">vs</span>
                    <span className="font-display font-semibold" style={{ color: `var(--color-${seat === 'p1' ? 'p2' : 'p1'})` }}>{bot}</span>
                    <span className="text-faint truncate max-w-[16rem]">{botDeck}</span>
                    {cur && <span className="text-dim num">Round {cur.round} · {cur.phase}</span>}
                    {down && !end && <span className="text-p2">Reconnecting…</span>}
                    <span className="ml-auto flex gap-2">
                        {!end && <button className="play-btn ghost" onClick={() => void table.concede(id)} title="Give up this game"><Flag size={14} /> Concede</button>}
                    </span>
                </div>
                <div className="flex-1 flex flex-col lg:flex-row min-h-0">
                    <div className="flex-1 min-w-0 px-2 py-3">
                        {cur && ids ? (
                            <PickContext.Provider value={decide && !sending ? pick : null}>
                                <Board state={cur} prev={shown!.prev} ids={ids[ids.length - 1]} prevIds={shown!.prev ? ids[0] : null} bots={names} actor={actor} step={shown!.n}
                                    onFocus={setFocus} onLeave={() => setFocus(null)} values={false} spots={false} />
                            </PickContext.Provider>
                        ) : <div className="p-8 text-dim flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Shuffling…</div>}
                    </div>
                    <aside className="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-line px-3 py-3 flex flex-col gap-2 max-h-[40vh] lg:max-h-none overflow-auto">
                        <h2 className="text-xs uppercase tracking-[0.12em] text-dim">Moves</h2>
                        <ol className="flex flex-col gap-1 text-[13px]">
                            {log.map((m) => (
                                <li key={m.n} className="flex gap-2 min-w-0">
                                    <span className="num text-faint w-7 shrink-0 text-right">{m.n}</span>
                                    <span className="shrink-0 font-semibold" style={{ color: `var(--color-${m.seat})` }}>{names[m.seat]}</span>
                                    <span className="text-dim truncate" title={m.label}>{moveText(m)}</span>
                                </li>
                            ))}
                        </ol>
                    </aside>
                </div>
                <PromptBar decide={decide} sending={sending} problem={problem} board={cur} bot={bot} drawn={cur ? drawnIds(cur, seat) : new Set()} pick={pick} onAct={act} ended={!!end} />
                {focus && <FloatingZoom key={`${focus.card.n}:${focus.rect?.left}:${focus.rect?.top}`} focus={focus} score={null} />}
                {end && <EndCard end={end} seat={seat} bot={bot} id={id} onLeave={onLeave} />}
            </div>
        </SettingsProvider>
    );
}

/** A move as a log line. */
function moveText(m: Omit<MoveMsg, 'state'>): string {
    if (m.kind === 'distribute' && m.split?.length) {
        return `split ${m.split.reduce((t, e) => t + e.amount, 0)}`;
    }
    if (m.kind === 'card' || m.kind === 'displayCard') {
        return m.label;
    }
    return m.label;
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

function PromptBar({ decide, sending, problem, board, bot, drawn, pick, onAct, ended }: {
    decide: DecideMsg | null; sending: boolean; problem: string | null; board: Snapshot | null; bot: string; drawn: Set<string>; pick: Pick;
    onAct: (a: Action, split?: { id: string; amount: number }[]) => void; ended: boolean;
}) {
    const [all, setAll] = useState(false);
    if (ended) {
        return null;
    }
    if (!decide) {
        return (
            <div className="play-bar">
                <span className="flex items-center gap-2 text-dim">{sending ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : <><Loader2 size={15} className="animate-spin" /> {bot} is thinking…</>}</span>
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
        <div className="play-bar" role="region" aria-label="Your decision" data-seq={decide.seq}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-display font-semibold text-[15px]">{promptText(decide)}</span>
                {glowing && <span className="text-dim text-xs">Click a glowing card, or choose below.</span>}
                {problem && <span className="text-p2 text-xs">{problem}</span>}
            </div>
            {tray.length > 0 && (
                <div className="flex flex-wrap gap-3 items-start">
                    {tray.map((c) => {
                        const per = acts.filter((a) => a.kind === 'perCardButton' && a.cardUuid === c.id);
                        return (
                            <div key={c.id} className={`flex flex-col items-center gap-1 ${c.st === 'unselectable' || c.st === 'invalid' ? 'opacity-50' : ''}`}>
                                <PickContext.Provider value={pick}>
                                    <Card card={c} size="sm" kind="hand" />
                                </PickContext.Provider>
                                <span className="text-[11px] text-dim max-w-[6rem] truncate" title={c.n}>{c.n}</span>
                                {per.map((a) => <button key={a.i} className="play-btn small" disabled={sending} onClick={() => onAct(a)}>{a.label.split(':')[0]}</button>)}
                            </div>
                        );
                    })}
                </div>
            )}
            {dist && <SplitPanel key={decide.seq} action={dist} d={dist.distribute!} board={board} sending={sending} onAct={onAct} />}
            <div className="flex flex-wrap gap-2 items-center">
                {elsewhere.map((a) => (
                    <button key={a.i} className="play-btn" disabled={sending} onClick={() => onAct(a)} title={a.card?.zone ? `In ${zoneName(a.card.zone)}` : undefined}>
                        {a.card?.id === 'hidden' ? 'A hidden card' : a.card?.n ?? a.label}{a.card?.zone ? <span className="text-faint text-xs ml-1">{zoneName(a.card.zone)}</span> : null}
                    </button>
                ))}
                {options.length > 0 && <Options options={options} sending={sending} onAct={onAct} />}
                {buttons.map((a) => <button key={a.i} className={`play-btn${/^(pass|done|confirm|keep)/i.test(a.label) ? ' primary' : ''}`} disabled={sending} onClick={() => onAct(a)}>{a.label}</button>)}
                <button className="play-btn ghost ml-auto" onClick={() => setAll((x) => !x)} aria-expanded={all}>{all ? 'Hide' : 'All'} moves ({acts.length})</button>
            </div>
            {all && (
                <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
                    {acts.map((a) => <button key={a.i} className="play-btn small" disabled={sending} onClick={() => onAct(a)}>{actionText(a)}</button>)}
                </div>
            )}
        </div>
    );
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
function Options({ options, sending, onAct }: { options: Action[]; sending: boolean; onAct: (a: Action) => void }) {
    const [q, setQ] = useState('');
    if (options.length <= 16) {
        return <>{options.map((a) => <button key={a.i} className="play-btn" disabled={sending} onClick={() => onAct(a)}>{a.label.replace(/^#/, '')}</button>)}</>;
    }
    const hits = q.trim() ? options.filter((a) => a.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 24) : [];
    return (
        <div className="flex flex-col gap-1.5 w-full">
            <input className="play-select max-w-sm" placeholder={`Search ${options.length} choices`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the choices" />
            <div className="flex flex-wrap gap-1.5">{hits.map((a) => <button key={a.i} className="play-btn small" disabled={sending} onClick={() => onAct(a)}>{a.label}</button>)}</div>
        </div>
    );
}

/** Split damage, healing or tokens: a stepper per target, sent only when it adds up. */
function SplitPanel({ action, d, board, sending, onAct }: { action: Action; d: Distribute; board: Snapshot | null; sending: boolean; onAct: (a: Action, split?: { id: string; amount: number }[]) => void }) {
    const [amounts, setAmounts] = useState<Record<string, number>>({});
    const split = d.targets.map((t) => ({ id: t.id, amount: amounts[t.id] ?? 0 })).filter((e) => e.amount > 0);
    const total = split.reduce((t, e) => t + e.amount, 0);
    const why = splitProblem(d, split);
    const name = (cid: string): CardRef | null => (board ? cardById(board, cid) : null);
    const bump = (cid: string, by: number, cap: number | null) => setAmounts((m) => {
        const v = Math.max(0, Math.min(cap ?? d.amount, (m[cid] ?? 0) + by));
        return { ...m, [cid]: v };
    });
    return (
        <div className="flex flex-col gap-2 border border-line rounded-lg p-2.5 bg-ink/60">
            <span className="text-sm">Split <b className="num">{d.amount}</b> {d.tokenType ?? d.type}: <span className={why ? 'text-gold' : 'text-good'}>{total} placed{why ? ` · ${why}` : ''}</span></span>
            <div className="flex flex-wrap gap-2">
                {d.targets.map((t) => {
                    const c = name(t.id);
                    const v = amounts[t.id] ?? 0;
                    return (
                        <div key={t.id} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1">
                            <span className="text-[13px] max-w-[9rem] truncate" title={c?.n ?? t.id}>{c?.n ?? t.id}</span>
                            <button className="play-icon" aria-label={`One less on ${c?.n ?? t.id}`} onClick={() => bump(t.id, -1, t.cap)} disabled={v === 0}><Minus size={13} /></button>
                            <span className="num w-5 text-center">{v}</span>
                            <button className="play-icon" aria-label={`One more on ${c?.n ?? t.id}`} onClick={() => bump(t.id, 1, t.cap)} disabled={(t.cap !== null && v >= t.cap) || total >= d.amount}><Plus size={13} /></button>
                        </div>
                    );
                })}
            </div>
            <div className="flex gap-2">
                <button className="play-btn primary" disabled={sending || !!why} onClick={() => onAct(action, split)}>Confirm split</button>
                <button className="play-btn ghost" disabled={sending} onClick={() => setAmounts({})}><RotateCcw size={13} /> Reset</button>
            </div>
        </div>
    );
}

function EndCard({ end, seat, bot, id, onLeave }: { end: EndMsg; seat: Seat; bot: string; id: string; onLeave: () => void }) {
    const table = useContext(TableContext);
    const watch = table.watch(id);
    const download = end.replay ? table.replayUrl(id) : null;
    const won = end.winner === seat;
    const { head, detail } = endText(end, seat, bot);
    return (
        <div className="play-end" role="dialog" aria-label="Game over">
            <div className="flex flex-col gap-3 items-start">
                <span className="font-display text-2xl font-bold" style={{ color: won ? 'var(--color-good)' : 'var(--color-p2)' }}>{head}</span>
                <span className="text-dim text-sm">{detail}</span>
                <div className="flex flex-wrap gap-2">
                    <button className="play-btn primary" onClick={onLeave}><Play size={14} /> Play again</button>
                    {typeof watch === 'string' && <a className="play-btn" href={watch}>Watch the replay</a>}
                    {typeof watch === 'function' && <button className="play-btn" onClick={watch}>Watch the replay</button>}
                    {download && <a className="play-btn ghost" href={download} download={`${id}.jsonl`}>Download replay</a>}
                </div>
            </div>
        </div>
    );
}
