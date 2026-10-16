/**
 * Play mode's keys (#/play): which key does which legal move. Keys are physical keys (KeyboardEvent.code), so the rows
 * keep their places on any layout. The keyboard's rows mirror the board's:
 *
 *   1 2 3 … 0     the prompt bar's choices, left to right (⇧1 … ⇧0 for choices 11 to 20)
 *   Q W E … P     the top side (the opponent): base, leader, then ground and space units left to right
 *   A S D … ;     the bottom side (you): base, leader, then units
 *   Z X C … .     your hand, left to right
 *   Space         the main button (Pass, Done, Confirm, Keep), or confirms a damage split
 *
 * A card keeps its key while the board doesn't change (keys come from board positions, not from which cards are legal
 * now), so the opponent's base is always Q and your leader always S. No React here: the tests load this file alone.
 */
import type { Action, DecideMsg } from './protocol';
import type { PlayerSnap, Seat, Snapshot } from '../data/types';

export const NUM_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'] as const;
/** ⇧ with a digit: choices 11 to 20 */
export const SHIFT_NUM_KEYS = NUM_KEYS.map((c) => `Shift+${c}`);
export const TOP_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'] as const;
export const HOME_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'] as const;
export const HAND_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period'] as const;
const LETTER_KEYS: readonly string[] = [...TOP_KEYS, ...HOME_KEYS, ...HAND_KEYS];

/** The gold-or-green button that Space presses: the bar draws these as its primary buttons. */
export const PRIMARY = /^(pass|done|confirm|keep)/i;

const NAMES: Record<string, string> = {
    Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Quote: "'",
    Backquote: '`', Backslash: '\\', Space: 'Space', Enter: 'Enter', Escape: 'Esc', Backspace: 'Backspace', Home: 'Home', End: 'End',
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ShiftLeft: '⇧', ShiftRight: '⇧'
};

/**
 * What a key's cap shows: the character the person's layout puts there (`layout`, from navigator.keyboard where the
 * browser has it), else the US layout's. `Shift+Digit1` reads ⇧1.
 */
export function keyLabel(code: string, layout?: ReadonlyMap<string, string> | null): string {
    if (code.startsWith('Shift+')) {
        return `⇧${keyLabel(code.slice(6), layout)}`;
    }
    const own = layout?.get(code);
    if (own && own.trim()) {
        return own.length === 1 ? own.toUpperCase() : own;
    }
    if (code.startsWith('Key')) {
        return code.slice(3);
    }
    if (code.startsWith('Digit')) {
        return code.slice(5);
    }
    return NAMES[code] ?? code;
}

/** The key a keydown means here: its physical key, with Shift named only on digits (⇧ + a letter means "look"). */
export function eventKey(e: { code: string; shiftKey: boolean }): string {
    return e.shiftKey && e.code.startsWith('Digit') ? `Shift+${e.code}` : e.code;
}

export interface KeyItem { id: string; prefer?: string | null; pool: readonly string[] }

/**
 * One key per item: its preferred key when no other item prefers it first, else the first free key of its pool, else
 * of `spare`. Items that find no free key get none (they stay clickable).
 */
export function assignKeys(items: KeyItem[], spare: readonly string[] = []): Map<string, string> {
    const used = new Set<string>();
    const out = new Map<string, string>();
    for (const it of items) {
        if (it.prefer && !used.has(it.prefer) && !out.has(it.id)) {
            used.add(it.prefer);
            out.set(it.id, it.prefer);
        }
    }
    for (const it of items) {
        if (out.has(it.id)) {
            continue;
        }
        const k = [...it.pool, ...spare].find((c) => !used.has(c));
        if (k) {
            used.add(k);
            out.set(it.id, k);
        }
    }
    return out;
}

/** A side's cards in key order: base, leader, ground units left to right, then space units (a card listed twice keeps its first place). */
export function sideOrder(p: PlayerSnap): string[] {
    const ids: string[] = [];
    for (const c of [p.base, p.leader, ...p.ground, ...p.space]) {
        if (c?.id && !ids.includes(c.id)) {
            ids.push(c.id);
        }
    }
    return ids;
}

export type KeyTarget = { kind: 'card'; id: string } | { kind: 'act'; action: Action };

export interface PlayKeys {
    /** card id → key: board and hand cards that are legal picks or split targets (letters), tray cards (digits) */
    card: Map<string, string>;
    /** action index → key, for the prompt bar's buttons */
    act: Map<number, string>;
    /** what Space and Enter press (null when a split is open: they confirm it) */
    primary: Action | null;
    /** a damage, healing or token split is being placed: its targets' keys add one each */
    split: boolean;
    /** a Cancel button Esc presses */
    cancel: Action | null;
    /** key → what it does */
    byKey: Map<string, KeyTarget>;
}

/** The card an action picks: the card's id for a card action, the shown card's id for a display pick. */
export function pickedCard(a: Action): string | undefined {
    const cid = a.kind === 'card' ? a.card?.id : a.kind === 'displayCard' ? String(a.arg) : undefined;
    return cid && cid !== 'hidden' ? cid : undefined;
}

const numeric = (a: Action) => /^#?(\d+)$/.exec(a.label.trim());

/**
 * Every key of one decision. `board` is the snapshot on screen (the board draws p2 on top and p1 at the bottom), `you`
 * the person's seat (their hand is the Z row), `drawn` the cards the board draws as faces. The prompt bar's order here is the order PlayPage's PromptBar draws it in: the
 * tray (each card, then its own buttons), legal cards the board doesn't show, menu options (up to 16; a longer list is
 * a search box), then the buttons other than the main one.
 */
export function playKeys(decide: DecideMsg | null, board: Snapshot | null, you: Seat, drawn: ReadonlySet<string>): PlayKeys {
    const acts = decide?.actions ?? [];
    const dist = acts.find((a) => a.kind === 'distribute');
    const buttons = acts.filter((a) => a.kind === 'button');
    const primary = dist ? null : buttons.find((a) => PRIMARY.test(a.label)) ?? (acts.length === 1 && acts[0].kind === 'button' ? acts[0] : null);
    const cancel = buttons.find((a) => /^cancel\b/i.test(a.label)) ?? null;
    const picks = new Map<string, Action>();
    for (const a of acts) {
        const cid = pickedCard(a);
        if (cid && !picks.has(cid)) {
            picks.set(cid, a);
        }
    }
    const tray = decide?.prompt.cards ?? [];
    const trayIds = new Set(tray.map((c) => c.id));
    const splitIds = new Set(dist?.distribute?.targets.map((t) => t.id) ?? []);
    const keyed = (id: string) => !trayIds.has(id) && ((picks.has(id) && drawn.has(id)) || splitIds.has(id));

    // the board: positions decide the keys, so a card keeps its key from one decision to the next. The rows follow
    // what the board draws (p2 on top, p1 at the bottom, whichever seat the person has), so a key cap sits on its row.
    const cards: KeyItem[] = [];
    if (board) {
        for (const [seat, row] of [['p2', TOP_KEYS], ['p1', HOME_KEYS]] as const) {
            sideOrder(board.players[seat]).forEach((id, i) => {
                if (keyed(id)) {
                    cards.push({ id, prefer: row[i] ?? null, pool: row });
                }
            });
        }
        board.players[you].hand.forEach((c, i) => {
            if (c.id && keyed(c.id)) {
                cards.push({ id: c.id, prefer: HAND_KEYS[i] ?? null, pool: HAND_KEYS });
            }
        });
    }
    // split targets the board doesn't draw still get a letter (the split panel lists them)
    for (const id of splitIds) {
        if (!cards.some((c) => c.id === id)) {
            cards.push({ id, pool: [] });
        }
    }
    const card = assignKeys(cards, LETTER_KEYS);

    // the prompt bar, in its drawing order
    const bar: KeyItem[] = [];
    const barPool = [...NUM_KEYS, ...SHIFT_NUM_KEYS];
    for (const c of tray) {
        if (picks.has(c.id)) {
            bar.push({ id: `card:${c.id}`, pool: barPool });
        }
        for (const a of acts) {
            if (a.kind === 'perCardButton' && a.cardUuid === c.id) {
                bar.push({ id: `act:${a.i}`, pool: barPool });
            }
        }
    }
    for (const a of acts) {
        if (a.kind === 'card' && (a.card?.id === 'hidden' || !drawn.has(a.card?.id ?? '')) && !trayIds.has(a.card?.id ?? '')) {
            bar.push({ id: `act:${a.i}`, pool: barPool });
        }
    }
    const options = acts.filter((a) => a.kind === 'option');
    if (options.length <= 16) {
        // "choose a number": 3 is the 3 key when every choice is a number from 0 to 9
        const digits = options.every((a) => numeric(a) && Number(numeric(a)![1]) <= 9);
        for (const a of options) {
            const n = digits ? Number(numeric(a)![1]) : null;
            bar.push({ id: `act:${a.i}`, prefer: n == null ? null : `Digit${n}`, pool: barPool });
        }
    }
    for (const a of buttons) {
        if (a !== primary) {
            bar.push({ id: `act:${a.i}`, pool: barPool });
        }
    }
    const barKeys = assignKeys(bar);

    const byKey = new Map<string, KeyTarget>();
    const act = new Map<number, string>();
    const byIndex = new Map(acts.map((a) => [a.i, a]));
    for (const [id, k] of card) {
        byKey.set(k, { kind: 'card', id });
    }
    for (const [id, k] of barKeys) {
        if (id.startsWith('card:')) {
            const cid = id.slice(5);
            card.set(cid, k);
            byKey.set(k, { kind: 'card', id: cid });
        } else {
            const a = byIndex.get(Number(id.slice(4)));
            if (a) {
                act.set(a.i, k);
                byKey.set(k, { kind: 'act', action: a });
            }
        }
    }
    return { card, act, primary, split: !!dist, cancel, byKey };
}

/** True when a key press belongs to a text field, a menu or a list box, so no hotkey may take it. */
export function isTyping(target: EventTarget | null): boolean {
    const el = target as (HTMLElement & { type?: string }) | null;
    if (!el || typeof el !== 'object' || !('tagName' in el)) {
        return false;
    }
    const tag = String(el.tagName ?? '');
    if (tag === 'TEXTAREA' || tag === 'SELECT') {
        return true;
    }
    if (tag === 'INPUT') {
        return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(String(el.type ?? 'text').toLowerCase());
    }
    if (el.isContentEditable) {
        return true;
    }
    return !!el.closest?.('[role="listbox"],[role="combobox"],[role="textbox"],[role="menu"]');
}
