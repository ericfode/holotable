/**
 * The open-tables parts of the play start screen (PlayPage's StartScreen): the mode tabs, adding a deck, the controls
 * that ask the table to find a person (Table.pair), and the waiting panel while it does. A table that offers none of
 * it never shows any of this.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Bot, Check, Copy, Link, Loader2, LogIn, Plus, Send, Users, X } from 'lucide-react';
import type { Seat } from '../data/types';
import type { DeckOption, PairRequest, PairState, Pairing, PeopleMode, Table } from './client';
import { MODE_NAMES, type StartMode } from './modes';

const message = (e: unknown) => String((e as Error)?.message ?? e);

const ICONS: Record<StartMode, typeof Bot> = { bot: Bot, lobby: Users, invite: Send, join: LogIn };

/** The row of mode tabs; arrow keys, Home and End move between them. `panel` is the id of the panel they control. */
export function ModeTabs({ modes, mode, onMode, panel }: { modes: StartMode[]; mode: StartMode; onMode: (m: StartMode) => void; panel: string }) {
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const key = (e: KeyboardEvent, i: number) => {
        const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? modes.length - 1 : null;
        if (to === null) {
            return;
        }
        e.preventDefault();
        const j = (to + modes.length) % modes.length;
        onMode(modes[j]);
        refs.current[j]?.focus();
    };
    return (
        <div role="tablist" aria-label="How to play" className="flex flex-wrap gap-2">
            {modes.map((m, i) => {
                const Icon = ICONS[m];
                const on = m === mode;
                return (
                    <button key={m} ref={(el) => { refs.current[i] = el; }} id={`play-tab-${m}`} role="tab" aria-selected={on} aria-controls={panel} tabIndex={on ? 0 : -1}
                        className={`play-btn ${on ? '!border-good' : 'ghost'}`} onClick={() => onMode(m)} onKeyDown={(e) => key(e, i)}>
                        <Icon size={15} /> {MODE_NAMES[m]}
                    </button>
                );
            })}
        </div>
    );
}

/** "Add a deck": a SWUDB link or a pasted list, handed to Table.importDeck; the added deck is passed to onAdded. */
export function DeckImport({ onImport, onAdded }: { onImport: (text: string) => Promise<DeckOption>; onAdded: (d: DeckOption) => void }) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    if (!open) {
        return <button className="play-btn ghost small self-start" aria-expanded={false} onClick={() => setOpen(true)}><Plus size={13} /> Add a deck</button>;
    }
    const add = async () => {
        setBusy(true);
        setError(null);
        try {
            const d = await onImport(text.trim());
            onAdded(d);
            setText('');
            setOpen(false);
        } catch (e) {
            setError(message(e));
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="flex flex-col gap-2 rounded-lg border border-line p-2.5">
            <label htmlFor="play-import" className="text-xs text-dim">Paste a SWUDB link or a deck list (JSON)</label>
            <textarea id="play-import" className="play-select font-mono text-xs w-full" style={{ height: 'auto', paddingBlock: 8 }} rows={3} autoFocus spellCheck={false}
                value={text} onChange={(e) => setText(e.target.value)} placeholder="https://swudb.com/deck/…" />
            <div className="flex flex-wrap items-center gap-2">
                <button className="play-btn primary small" disabled={busy || !text.trim()} onClick={add}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add</button>
                <button className="play-btn ghost small" disabled={busy} onClick={() => { setOpen(false); setError(null); }}>Close</button>
                {error && <span role="alert" className="text-p2 text-xs">{error}</span>}
            </div>
        </div>
    );
}

const TEXT: Record<Exclude<StartMode, 'bot'>, string> = {
    lobby: 'You sit down with the next person looking for a game. Each of you plays your own deck.',
    invite: 'Make a link and a short code to send a friend. The game starts when they open it.',
    join: 'Paste the link or the code a friend sent you. You play the deck picked here.'
};

/** One people mode's controls: they build the PairRequest for `deck` and hand it to onPair. */
export function PeopleStart({ mode, people, deck, joinCode, error, onPair }: {
    mode: Exclude<StartMode, 'bot'>; people: PeopleMode[]; deck: string; joinCode: string; error: string | null; onPair: (req: PairRequest) => void;
}) {
    const [withBot, setWithBot] = useState(true);
    const [code, setCode] = useState(joinCode);
    const invite = people.includes('invite');
    const direct = people.includes('direct');
    return (
        <div className="flex flex-col gap-3 min-w-0">
            <span className="text-xs uppercase tracking-[0.12em] text-dim">{MODE_NAMES[mode]}</span>
            <p className="text-dim text-sm">{mode === 'invite' && !invite ? 'Make a code to send a friend. They paste it and send a code back; no lobby in between.' : TEXT[mode]}</p>
            {mode === 'lobby' && <>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="mt-1 accent-good" checked={withBot} onChange={(e) => setWithBot(e.target.checked)} />
                    <span>Play a bot if nobody comes within 30 seconds</span>
                </label>
                <div><button className="play-btn primary" disabled={!deck} onClick={() => onPair({ how: 'lobby', deck, botAfterMs: withBot ? 30000 : null })}><Users size={16} /> Find a game</button></div>
            </>}
            {mode === 'invite' && (
                <div className="flex flex-wrap gap-2">
                    {invite && <button className="play-btn primary" disabled={!deck} onClick={() => onPair({ how: 'invite', deck })}><Link size={16} /> Make an invite link</button>}
                    {direct && <button className={`play-btn${invite ? '' : ' primary'}`} disabled={!deck} onClick={() => onPair({ how: 'direct', deck })}>No lobby: make a code to paste</button>}
                </div>
            )}
            {mode === 'join' && (
                <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (deck && code.trim()) { onPair({ how: 'join', deck, code: code.trim() }); } }}>
                    <label htmlFor="play-join" className="text-xs text-dim">Paste the link or code</label>
                    <div className="flex gap-2 min-w-0">
                        <input id="play-join" className="play-select flex-1 font-mono" autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
                        <button type="submit" className="play-btn primary shrink-0" disabled={!deck || !code.trim()}><LogIn size={16} /> Join</button>
                    </div>
                </form>
            )}
            {error && <span role="alert" className="text-p2 text-sm">{error}</span>}
        </div>
    );
}

/** Asking the table for a person: the open Pairing, what it last reported, and how to answer or cancel it. */
export function usePairing(table: Table, onStart: (g: { id: string; seat: Seat; bot: string }) => void, onError: (why: string) => void) {
    const [open, setOpen] = useState<{ pairing: Pairing | null; state: PairState } | null>(null);
    const current = useRef<object | null>(null);
    const pairingRef = useRef<Pairing | null>(null);
    // leaving the screen (the host unmounts the kit) gives up a pairing still open; a started game has cleared it
    useEffect(() => () => {
        if (current.current) {
            current.current = null;
            pairingRef.current?.cancel();
        }
    }, []);
    const start = (req: PairRequest) => {
        if (!table.pair || current.current) {
            return;
        }
        const token = {};
        current.current = token;
        pairingRef.current = null;
        setOpen({ pairing: null, state: { text: 'Starting…' } });
        let pairing: Pairing;
        try {
            pairing = table.pair(req, (state) => {
                if (current.current === token) {
                    setOpen((o) => ({ pairing: o?.pairing ?? null, state }));
                }
            });
        } catch (e) {
            current.current = null;
            setOpen(null);
            onError(message(e));
            return;
        }
        pairingRef.current = pairing;
        setOpen((o) => o && { ...o, pairing });
        pairing.done.then((g) => {
            if (current.current === token) {
                current.current = null;
                onStart({ id: g.id, seat: g.seat, bot: g.opponent });
            }
        }, (e) => {
            if (current.current === token) {
                current.current = null;
                setOpen(null);
                onError(message(e));
            }
        });
    };
    const cancel = () => {
        const pairing = pairingRef.current;
        current.current = null;
        pairingRef.current = null;
        setOpen(null);
        pairing?.cancel();
    };
    return { open, start, cancel };
}

/** While a pairing is open: what is happening, the link and code to send (with Copy), the answer field, and Cancel. */
export function PairingPanel({ pairing, state, onCancel }: { pairing: Pairing | null; state: PairState; onCancel: () => void }) {
    const [answer, setAnswer] = useState('');
    const canAnswer = !!state.askCode && !!pairing?.answer;
    const box = useRef<HTMLElement>(null);
    // keyboard focus moves here from the button that opened it (now hidden), and back to that button when it closes
    useLayoutEffect(() => {
        const root = box.current?.getRootNode() as Document | ShadowRoot | undefined;
        const from = root?.activeElement as HTMLElement | null | undefined;
        box.current?.focus();
        return () => {
            setTimeout(() => {
                if (from?.isConnected) {
                    from.focus();
                }
            });
        };
    }, []);
    return (
        <section ref={box} tabIndex={-1} className="flex flex-col gap-4 rounded-lg border border-line bg-panel p-4 min-w-0 outline-none" aria-label="Finding a game">
            <p className="flex items-center gap-2 font-display font-semibold" aria-live="polite"><Loader2 size={16} className="animate-spin shrink-0" /> {state.text}</p>
            {state.link && <CopyField id="play-pair-link" label="Link to send" value={state.link} />}
            {state.code && <CopyField id="play-pair-code" label="Code to send" value={state.code} />}
            {canAnswer && (
                <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (answer.trim()) { pairing!.answer!(answer.trim()); } }}>
                    <label htmlFor="play-pair-answer" className="text-xs text-dim">{state.askCode}</label>
                    <div className="flex gap-2 min-w-0">
                        <input id="play-pair-answer" className="play-select flex-1 font-mono" autoComplete="off" spellCheck={false} value={answer} onChange={(e) => setAnswer(e.target.value)} />
                        <button type="submit" className="play-btn primary shrink-0" disabled={!answer.trim()}>Connect</button>
                    </div>
                </form>
            )}
            <div><button className="play-btn ghost" onClick={onCancel}><X size={14} /> Cancel</button></div>
        </section>
    );
}

/** A link or code to send, read-only, with a Copy button (selecting the text when the clipboard is out of reach). */
function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
    const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
    const [done, setDone] = useState<'copied' | 'selected' | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (timer.current) {
            clearTimeout(timer.current);
        }
    }, []);
    const show = (what: 'copied' | 'selected') => {
        setDone(what);
        if (timer.current) {
            clearTimeout(timer.current);
        }
        timer.current = setTimeout(() => setDone(null), 2500);
    };
    const select = () => {
        field.current?.focus();
        field.current?.select();
        show('selected');
    };
    const copy = () => {
        if (!navigator.clipboard?.writeText) {
            select();
            return;
        }
        navigator.clipboard.writeText(value).then(() => show('copied'), select);
    };
    const long = value.length > 48;
    const common = { id, ref: field, readOnly: true, value, spellCheck: false, onFocus: () => field.current?.select(), className: 'play-select w-full font-mono text-xs' };
    return (
        <div className="flex flex-col gap-1.5 min-w-0">
            <label htmlFor={id} className="text-xs text-dim">{label}</label>
            <div className="flex gap-2 items-start min-w-0">
                {long
                    ? <textarea {...common} rows={3} className={`${common.className} break-all`} style={{ height: 'auto', paddingBlock: 8, resize: 'vertical' }} />
                    : <input {...common} className={`${common.className} !text-sm`} />}
                <button className="play-btn shrink-0" onClick={copy}>{done === 'copied' ? <Check size={14} /> : <Copy size={14} />} {done === 'copied' ? 'Copied' : 'Copy'}</button>
            </div>
            {done === 'selected' && <span className="text-xs text-dim" role="status">Selected: copy it with Ctrl+C (⌘C on a Mac).</span>}
        </div>
    );
}
