/**
 * What a table sends a person's screen, and what the screen answers: the arena's bot protocol v2 (its
 * spec/protocol.md: hello, decide, over, act) plus the table's own `move` and `end` (its bot/table/table.js).
 * A person is one more seat, so `decide` here is exactly the message a bot gets for the same decision.
 */
import type { CardRef, PlayerSnap, Seat, Snapshot } from '../data/types';

export interface PlacedRef extends CardRef { id: string; zone: string | null; ctl: Seat | null }

export interface Distribute {
    type: string;
    amount: number;
    canDistributeLess: boolean;
    canChooseNoTargets: boolean;
    maxTargets: number | null;
    tokenType: string | null;
    targets: { id: string; cap: number | null }[];
}

export interface Action {
    i: number;
    kind: 'button' | 'card' | 'option' | 'displayCard' | 'perCardButton' | 'distribute';
    label: string;
    arg?: string | number;
    cardUuid?: string;
    card?: PlacedRef;
    distribute?: Distribute;
    /**
     * the move would change nothing (the referee asks the engine for a seat that wants to know: an event with no legal
     * target, an action ability with nothing to do); the move stays legal, and the engine asks again before it plays
     */
    noEffect?: boolean;
    /** what this answer would do, worked out by the table on a copy of the game before it is sent (MovePreview) */
    preview?: MovePreview;
}

/**
 * One card a previewed answer changes (the arena's bot/table/preview.js): `d` damage added to a unit or base (below 0:
 * healed), `gone` how a unit leaves play ('left': the person cannot see where it went), `lost` the ids of its upgrades
 * that go (a Shield token that breaks).
 */
export interface PreviewChange { id: string; d?: number; gone?: 'defeated' | 'captured' | 'returned' | 'left'; lost?: string[] }
/**
 * What an answer would do: the cards it changes, `more` when more choices follow (the person's or the bot's, so the
 * result stops there) and `winner` when it ends the game. The table re-deals every card the person cannot see first,
 * so a preview never gives one away.
 */
export interface MovePreview { cards: PreviewChange[]; more?: boolean; winner?: Seat }

const GONE: Record<NonNullable<PreviewChange['gone']>, string> = { defeated: 'Defeated', captured: 'Captured', returned: 'Back to hand', left: 'Leaves play' };

/** A change as a few words on the card it changes: "Defeated", "3 damage", "Heals 2", "Loses Shield". */
export function changeText(c: PreviewChange, upgradeName?: (id: string) => string | null): string {
    if (c.gone) {
        return GONE[c.gone] ?? 'Leaves play';
    }
    const parts: string[] = [];
    if (c.d && c.d > 0) {
        parts.push(`${c.d} damage`);
    } else if (c.d && c.d < 0) {
        parts.push(`Heals ${-c.d}`);
    }
    if (c.lost?.length) {
        const names = c.lost.map((id) => upgradeName?.(id) ?? null);
        parts.push(`Loses ${names.every(Boolean) ? [...new Set(names)].join(', ') : c.lost.length === 1 ? 'an upgrade' : `${c.lost.length} upgrades`}`);
    }
    return parts.join(' · ');
}

/** A change in a word or two, for the mark on a card a choice would change: "Defeated", "3 dmg", "+2 HP", "−Shield". */
export function changeShort(c: PreviewChange, upgradeName?: (id: string) => string | null): string {
    if (c.gone) {
        return c.gone === 'returned' ? 'To hand' : c.gone === 'left' ? 'Leaves' : GONE[c.gone] ?? 'Leaves';
    }
    const parts: string[] = [];
    if (c.d && c.d > 0) {
        parts.push(`${c.d} dmg`);
    } else if (c.d && c.d < 0) {
        parts.push(`+${-c.d} HP`);
    }
    for (const id of c.lost ?? []) {
        parts.push(`−${upgradeName?.(id) ?? 'upgrade'}`);
    }
    return parts.join(' ');
}

/**
 * A preview as one line for the prompt bar or a card's moves: each change with the card's name ("Wing Leader:
 * defeated · K-2SO: 2 damage"), then the end of the game or "then more choices". Cards the board cannot name are left
 * out; an answer that changes nothing says so.
 */
export function previewText(p: MovePreview, nameOf: (id: string) => string | null, you: Seat): string {
    const parts = p.cards.map((c) => {
        const n = nameOf(c.id);
        const t = changeText(c, nameOf);
        return n && t ? `${n}: ${t.charAt(0).toLowerCase()}${t.slice(1)}` : null;
    }).filter(Boolean) as string[];
    if (p.winner) {
        parts.push(p.winner === you ? 'you win' : 'you lose');
    } else if (p.more) {
        parts.push(parts.length ? 'then more choices' : 'more choices follow');
    }
    return parts.length ? parts.join(' · ') : 'Nothing on the board changes';
}

/** A preview as a map from card id to its change, for the board to draw; null without one. */
export function outcomeOf(p: MovePreview | null | undefined): Map<string, PreviewChange> | null {
    return p?.cards?.length ? new Map(p.cards.map((c) => [c.id, c])) : null;
}

export interface PromptCard extends PlacedRef { st: 'selectable' | 'selected' | 'unselectable' | 'invalid' | 'viewOnly' }

export interface PromptView {
    type: string | null;
    signature: string;
    title: string | null;
    promptTitle: string | null;
    selectCardMode: 'single' | 'multiple' | null;
    selected: string[];
    actionWindow: boolean;
    cards?: PromptCard[];
}

/** The board from one seat (protocol `state`): the other seat's hand and resources are left out. */
export interface SeatState {
    round: number;
    phase: string;
    initiative: Seat | null;
    players: Record<Seat, Omit<PlayerSnap, 'hand'> & { hand?: CardRef[] }>;
}

export interface DeckList { metadata?: { name?: string }; leader: { id: string; count: number }; base: { id: string; count: number }; deck: { id: string; count: number }[] }

export interface HelloMsg { t: 'hello'; you: Seat; players: { id: Seat; name: string; bot: string }[]; deck: DeckList; opponent: DeckList }
/** undo: the person may take back their last move instead of answering (a game against a bot: Act {t: 'undo'}) */
export interface DecideMsg { t: 'decide'; seq: number; you: Seat; ms: number | null; prompt: PromptView; state: SeatState; actions: Action[]; revealed: PlacedRef[]; undo?: boolean }
export interface MoveMsg { t: 'move'; n: number; seat: Seat; kind: Action['kind']; label: string; card?: CardRef; split?: { id: string; amount: number }[]; state: SeatState }
export interface OverMsg { t: 'over'; you: Seat; winner: Seat | null; outcome: string; round: number; steps: number }
/** conceded: the game ended by a concession; concededBy: whose (a table with two people says; without it, the person's) */
export interface EndMsg { t: 'end'; winner: Seat | null; outcome: string; round: number; steps: number; error: string | null; by: Seat | null; conceded: boolean; concededBy?: Seat | null; replay: string | null }
/** A move taken back: the moves after move n are gone and the board is `state` again; or `error`, and nothing changed. */
export interface RewindMsg { t: 'rewind'; n?: number; state?: SeatState; error?: string }
export type TableMsg = HelloMsg | DecideMsg | MoveMsg | OverMsg | EndMsg | RewindMsg;

/** An answer, or `undo`: take back the person's last move (and the other side's moves after it), when decide.undo */
export type Act = { t: 'act'; seq: number; i: number; split?: { id: string; amount: number }[] } | { t: 'undo'; seq: number };

/**
 * The seat view as a Holotable snapshot, so the replay board draws it. The other hand becomes face-down
 * placeholders (the board shows them as card backs from `you`'s side).
 */
export function toSnapshot(s: SeatState, you: Seat): Snapshot {
    const players = {} as Record<Seat, PlayerSnap>;
    for (const seat of ['p1', 'p2'] as Seat[]) {
        const p = s.players[seat];
        const hand = p.hand ?? Array.from({ length: p.handCount ?? 0 }, (_, k) => ({ id: `${seat}-hidden-${k}`, n: 'Hidden card', s: null }));
        players[seat] = { ...p, hand, ...(seat === you ? {} : { resources: undefined }) } as PlayerSnap;
    }
    return { round: s.round, phase: s.phase, initiative: s.initiative, players };
}

/**
 * Why `split` is not a legal split of `d`, or null when it is (the table checks the same: listed targets once,
 * whole amounts up to each cap, at most maxTargets used, the right total).
 */
export function splitProblem(d: Distribute, split: { id: string; amount: number }[]): string | null {
    const caps = new Map(d.targets.map((t) => [t.id, t.cap]));
    let total = 0;
    let used = 0;
    for (const e of split) {
        const cap = caps.get(e.id);
        if (cap === undefined) {
            return 'that card cannot take any';
        }
        if (!Number.isInteger(e.amount) || e.amount < 0 || (cap !== null && e.amount > cap)) {
            return `at most ${cap} there`;
        }
        total += e.amount;
        used += e.amount > 0 ? 1 : 0;
    }
    if (d.maxTargets != null && used > d.maxTargets) {
        return `at most ${d.maxTargets} target${d.maxTargets === 1 ? '' : 's'}`;
    }
    if (total > d.amount) {
        return `${total - d.amount} too many`;
    }
    if (total < d.amount && !d.canDistributeLess) {
        return `${d.amount - total} left to place`;
    }
    if (total === 0 && !d.canChooseNoTargets && d.amount > 0) {
        return 'choose at least one target';
    }
    return null;
}

/**
 * The end card's headline and detail line for the person at `seat` (`opponent` names the other seat). A concession is
 * the person's own unless `concededBy` names the other seat: then the person won because they conceded.
 */
export function endText(end: EndMsg, seat: Seat, opponent: string): { head: string; detail: string } {
    const won = end.winner === seat;
    if (won && end.concededBy != null && end.concededBy !== seat) {
        return { head: 'You won', detail: 'They conceded.' };
    }
    const head = end.conceded ? 'You conceded' : won ? 'You won' : end.winner ? `${opponent} won` : 'No winner';
    const detail = end.outcome === 'won' ? `Round ${end.round}, ${end.steps} moves.` : end.outcome === 'ERROR' && !end.conceded ? `The game stopped: ${end.error ?? 'an error'}.` : end.outcome === 'STEP_CAP' ? 'The game ran out of moves.' : `Round ${end.round}.`;
    return { head, detail };
}

/** The card an action picks or acts on, by id: a card action's card, a display pick's shown card, a per-card button's card. */
export function actionCardId(a: Action): string | undefined {
    return a.kind === 'card' ? a.card?.id : a.kind === 'displayCard' ? String(a.arg) : a.kind === 'perCardButton' ? a.cardUuid : undefined;
}

/**
 * The word on a card's move button (a card opened by a tap shows its moves): Play for a card from the hand (or any zone
 * but the board and the base zone), Attack or use for a unit, Use for a leader or base, Select or Unselect in a prompt
 * that picks several cards, Choose in any other card prompt; a per-card button keeps its own word.
 */
export function moveVerb(a: Action, m: DecideMsg): string {
    if (a.kind === 'perCardButton') {
        return a.label.split(':')[0];
    }
    if (m.prompt.selectCardMode === 'multiple') {
        return m.prompt.selected.includes(actionCardId(a) ?? '') ? 'Unselect' : 'Select';
    }
    if (m.prompt.actionWindow && a.kind === 'card') {
        const zone = a.card?.zone;
        return zone === 'groundArena' || zone === 'spaceArena' ? 'Attack or use' : zone === 'base' ? 'Use' : 'Play';
    }
    return 'Choose';
}

/** The icon of a card's move, drawn on the card itself on a touch screen (Card's move chip): one per moveVerb case. */
export type MoveIcon = 'play' | 'attack' | 'use' | 'choose' | 'select' | 'unselect';

export function moveIcon(a: Action, m: DecideMsg): MoveIcon {
    switch (moveVerb(a, m)) {
        case 'Play':
            return 'play';
        case 'Attack or use':
            return 'attack';
        case 'Use':
            return 'use';
        case 'Select':
            return 'select';
        case 'Unselect':
            return 'unselect';
        default:
            return 'choose';
    }
}

/** A move in a few words, for the Undo strip while it waits: "Play Neel", "Pass", "Split 3 damage". */
export function moveText(a: Action, m: DecideMsg): string {
    if (a.kind === 'distribute') {
        return `Split ${a.distribute?.amount ?? ''} ${a.distribute?.tokenType ?? a.distribute?.type ?? ''}`.replace(/\s+/g, ' ').trim();
    }
    if (a.kind === 'perCardButton') {
        const [what, ...rest] = a.label.split(':');
        return rest.length ? `${what}: ${rest.join(':')}` : what;
    }
    if (a.kind === 'card' || a.kind === 'displayCard') {
        const id = actionCardId(a);
        const name = a.card?.id === 'hidden' ? 'a hidden card' : a.card?.n ?? m.prompt.cards?.find((c) => c.id === id)?.n ?? a.label;
        return `${moveVerb(a, m)} ${name}`;
    }
    return a.label.replace(/^#/, '');
}

/**
 * A menu choice the engine marked as doing nothing ("(No effect) Attack", forceteki's ActionWindow): its words without
 * the mark, and whether it had it.
 */
export function noEffectText(label: string): { text: string; dud: boolean } {
    const m = /^\(No effect\)\s*/i.exec(label);
    return m ? { text: label.slice(m[0].length), dud: true } : { text: label, dud: false };
}

/** A move that would change nothing: marked by the referee, or by the engine in the choice's own words. */
export const isDud = (a: Action) => !!a.noEffect || noEffectText(a.label).dud;

/** Engine prompt texts as a sentence: "Choose an action", a menu title, or a card prompt. */
export function promptText(m: DecideMsg): string {
    const p = m.prompt;
    if (p.actionWindow) {
        return 'Your action';
    }
    return (p.promptTitle && p.title && p.promptTitle !== p.title ? `${p.promptTitle}: ${p.title}` : p.title ?? p.promptTitle) ?? 'Choose';
}
