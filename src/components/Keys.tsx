import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Keyboard, X } from 'lucide-react';
import { keyLabel } from '../play/keys';

/*
 * Keyboard keys on screen: key caps, the "Keys" button, and the overlay that lists every key (play mode and replays).
 * Caps show the character the person's layout puts on each physical key where the browser tells us
 * (navigator.keyboard.getLayoutMap, Chromium), else the US layout's.
 */

let layout: ReadonlyMap<string, string> | null = null;
let asked = false;
const layoutSubs = new Set<() => void>();

function askLayout() {
    if (asked || typeof navigator === 'undefined') {
        return;
    }
    asked = true;
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> } }).keyboard;
    try {
        kb?.getLayoutMap?.().then((m) => {
            layout = new Map(m);
            layoutSubs.forEach((f) => f());
        }, () => undefined);
    } catch {
        // not allowed here (a frame without keyboard-map): US labels
    }
}

/** The person's keyboard layout, once the browser has said (null until then, or where it can't). */
export function useKeyLayout(): ReadonlyMap<string, string> | null {
    askLayout();
    return useSyncExternalStore((f) => {
        layoutSubs.add(f);
        return () => layoutSubs.delete(f);
    }, () => layout, () => null);
}

const HINTS = 'holotable.keyHints';
let hints = (() => {
    try {
        return localStorage.getItem(HINTS) !== 'off';
    } catch {
        return true;
    }
})();
const hintSubs = new Set<() => void>();

/** Key caps on cards and buttons in play mode: on unless the person turned them off (saved in this browser). */
export function useKeyHints(): [boolean, (on: boolean) => void] {
    const on = useSyncExternalStore((f) => {
        hintSubs.add(f);
        return () => hintSubs.delete(f);
    }, () => hints, () => hints);
    const set = (v: boolean) => {
        hints = v;
        try {
            localStorage.setItem(HINTS, v ? 'on' : 'off');
        } catch {
            // storage blocked: the switch lasts until the page closes
        }
        hintSubs.forEach((f) => f());
    };
    return [on, set];
}

/** One key cap. `k` is a physical key (KeyboardEvent.code, or Shift+Digit1), or a plain label like "?" or "Esc". */
export function Kbd({ k, className = '', style }: { k: string; className?: string; style?: CSSProperties }) {
    const map = useKeyLayout();
    return <kbd className={`kc ${className}`} style={style} aria-hidden="true">{keyLabel(k, map)}</kbd>;
}

/** The button that opens the key list. */
export function KeysButton({ onClick, className = 'btn !h-8' }: { onClick: () => void; className?: string }) {
    return (
        <button type="button" className={className} onClick={onClick} title="Keyboard keys (?)" aria-label="Keyboard keys" aria-keyshortcuts="?">
            <Keyboard size={14} /><span className="hidden sm:inline">Keys</span><Kbd k="?" className="!text-[10px]" />
        </button>
    );
}

type Tone = 'them' | 'you' | 'hand' | 'choice' | 'main' | 'move' | 'other';

/** A keyboard drawn as its rows, US positions, with the keys that do something here coloured by what they reach. */
const ROWS: { indent: number; keys: string[] }[] = [
    { indent: 0, keys: ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'] },
    { indent: 0.5, keys: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'] },
    { indent: 0.8, keys: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'] },
    { indent: 1.3, keys: ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'] }
];

function KeyboardMap({ tone, sub = {}, rowNotes = [], spaceNote }: { tone: (code: string) => Tone | null; sub?: Record<string, string>; rowNotes?: (ReactNode | null)[]; spaceNote: ReactNode }) {
    const map = useKeyLayout();
    return (
        <div className="kmap" aria-hidden="true">
            {ROWS.map((r, i) => (
                <div key={i} className="kmap-row">
                    <span style={{ width: `calc(${r.indent} * var(--k))` }} className="shrink-0" />
                    {r.keys.map((code) => {
                        const t = tone(code);
                        return (
                            <span key={code} className={`kmap-key${t ? ` on k-${t}` : ''}`}>
                                {keyLabel(code, map)}
                                {sub[code] && <small>{sub[code]}</small>}
                            </span>
                        );
                    })}
                    {rowNotes[i] && <span className="kmap-note">{rowNotes[i]}</span>}
                </div>
            ))}
            <div className="kmap-row">
                <span style={{ width: 'calc(3.4 * var(--k))' }} className="shrink-0" />
                <span className="kmap-key on k-main kmap-space">Space</span>
                <span className="kmap-note">{spaceNote}</span>
            </div>
        </div>
    );
}

const range = (from: string, to: string) => <><Kbd k={from} />…<Kbd k={to} /></>;

function Row({ keys, children }: { keys: ReactNode; children: ReactNode }) {
    return (
        <>
            <dt className="flex items-center gap-1 flex-wrap justify-end text-right">{keys}</dt>
            <dd className="m-0 text-dim">{children}</dd>
        </>
    );
}

const PLAY_TONES: Record<string, Tone> = {};
for (const c of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']) PLAY_TONES[c] = 'choice';
for (const c of ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP']) PLAY_TONES[c] = 'them';
for (const c of ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon']) PLAY_TONES[c] = 'you';
for (const c of ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period']) PLAY_TONES[c] = 'hand';

const REPLAY_TONES: Record<string, Tone> = {
    KeyA: 'move', KeyD: 'move', KeyW: 'move', KeyS: 'move', KeyQ: 'move', KeyE: 'move', BracketLeft: 'move', BracketRight: 'move',
    Minus: 'other', Equal: 'other', KeyH: 'other', KeyC: 'other', KeyL: 'other'
};
for (const c of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']) REPLAY_TONES[c] = 'choice';

/**
 * Every key, on a drawn keyboard: in play mode its rows are the board's rows (choices, the top side, the bottom side,
 * your hand; your confirmed seat always sits at the bottom); in a replay the left hand's W A S D
 * steps and jumps. Esc, ? or a click outside closes it.
 */
export function KeyHelp({ mode, live = false, onClose }: { mode: 'play' | 'replay'; live?: boolean; seat?: 'p1' | 'p2'; onClose: () => void }) {
    const [hints, setHints] = useKeyHints();
    const playTone = (c: string): Tone | null => PLAY_TONES[c] ?? null;
    const topSide = 'Their side';
    const bottomSide = 'Your side';
    const close = useRef<HTMLButtonElement>(null);
    useEffect(() => close.current?.focus(), []);
    return (
        <div className="keyhelp-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="keyhelp panel" role="dialog" aria-modal="true" aria-label="Keyboard keys">
                <div className="flex items-center gap-2">
                    <Keyboard size={16} className="text-dim" />
                    <h2 className="font-display text-lg font-bold m-0">{mode === 'play' ? 'Play with the keyboard' : 'Watch with the keyboard'}</h2>
                    <button ref={close} type="button" className="btn !h-8 !px-2 ml-auto" onClick={onClose} aria-label="Close"><X size={14} /></button>
                </div>
                {mode === 'play' ? (
                    <>
                        <p className="text-dim text-[13px] m-0">The keyboard's rows are the board's rows. Every card you can pick and every choice shows its key.</p>
                        <KeyboardMap tone={playTone} sub={{ KeyQ: 'base', KeyW: 'leader', KeyA: 'base', KeyS: 'leader' }}
                            rowNotes={[<span key="c" className="k-choice">choices in the bar</span>, <span key="t" className="k-them">{topSide.toLowerCase()}</span>, <span key="y" className="k-you">{bottomSide.toLowerCase()}</span>, <span key="h" className="k-hand">your hand</span>]}
                            spaceNote={<span className="k-main">main button</span>} />
                        <dl className="keyhelp-list">
                            <Row keys={<><Kbd k="Space" /> <Kbd k="Enter" /></>}>The green button: Pass, Done, Confirm, Keep</Row>
                            <Row keys={range('Digit1', 'Digit0')}>The other choices in the bar, left to right (<Kbd k="Shift+Digit1" />… for 11 and up)</Row>
                            <Row keys={range('KeyQ', 'KeyP')}>{topSide} (the top): base, leader, then units left to right</Row>
                            <Row keys={range('KeyA', 'Semicolon')}>{bottomSide} (the bottom): base, leader, then units left to right</Row>
                            <Row keys={range('KeyZ', 'Period')}>Your hand, left to right</Row>
                            <Row keys={<><Kbd k="ShiftLeft" /> + card letter</>}>Look at a card on the board or in your hand without picking it; then <Kbd k="Enter" /> picks it, <Kbd k="Escape" /> closes</Row>
                            <Row keys={<>card key</>}>Splitting damage or healing: one more there. <Kbd k="Backspace" /> takes the last one back, <Kbd k="Space" /> confirms</Row>
                            <Row keys={<Kbd k="Escape" />}>Cancel, when the choice offers it</Row>
                            <Row keys={<><Kbd k="Ctrl" /> <Kbd k="KeyZ" /></>}>Undo: take back your last move and the bot's moves after it (games against a bot; ⌘Z on a Mac)</Row>
                            <Row keys={<Kbd k="Slash" />}>Search a long list of choices</Row>
                            <Row keys={<Kbd k="?" />}>This list</Row>
                        </dl>
                        <label className="flex items-center gap-2 text-[13px] text-dim cursor-pointer select-none">
                            <input type="checkbox" checked={hints} onChange={(e) => setHints(e.target.checked)} />
                            Show the keys on cards and buttons
                        </label>
                    </>
                ) : (
                    <>
                        <p className="text-dim text-[13px] m-0">Your left hand steps through the game; the arrow keys do the same.</p>
                        <KeyboardMap tone={(c) => REPLAY_TONES[c] ?? null} sub={{ KeyA: 'back', KeyD: 'next', KeyW: 'round', KeyS: 'round', KeyQ: 'key', KeyE: 'key' }}
                            rowNotes={[<span key="j" className="k-choice">jump to 0–90%</span>, null, null, null]} spaceNote={<span className="k-main">play, pause</span>} />
                        <dl className="keyhelp-list">
                            <Row keys={<><Kbd k="KeyA" /><Kbd k="KeyD" /> or <Kbd k="ArrowLeft" /><Kbd k="ArrowRight" /></>}>One decision back, forward (<Kbd k="ShiftLeft" /> for ten)</Row>
                            <Row keys={<><Kbd k="KeyW" /><Kbd k="KeyS" />, <Kbd k="ArrowUp" /><Kbd k="ArrowDown" /> or <Kbd k="BracketLeft" /><Kbd k="BracketRight" /></>}>Previous, next round</Row>
                            <Row keys={<><Kbd k="KeyQ" /><Kbd k="KeyE" /></>}>Previous, next key moment (the marks on the timeline)</Row>
                            <Row keys={<Kbd k="Space" />}>Play, pause</Row>
                            <Row keys={<>{range('Digit0', 'Digit9')}, <Kbd k="Home" /> <Kbd k="End" /></>}>Jump to 0% … 90% of the game, the start, the end</Row>
                            <Row keys={<><Kbd k="Minus" /><Kbd k="Equal" /></>}>Slower, faster</Row>
                            <Row keys={<Kbd k="KeyH" />}>Whose hand to show: both, one, the other</Row>
                            <Row keys={<Kbd k="KeyC" />}>Card art or tiles</Row>
                            {live && <Row keys={<Kbd k="KeyL" />}>Back to live</Row>}
                            <Row keys={<Kbd k="?" />}>This list</Row>
                        </dl>
                    </>
                )}
            </div>
        </div>
    );
}
