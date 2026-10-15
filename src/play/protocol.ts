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
export interface DecideMsg { t: 'decide'; seq: number; you: Seat; ms: number | null; prompt: PromptView; state: SeatState; actions: Action[]; revealed: PlacedRef[] }
export interface MoveMsg { t: 'move'; n: number; seat: Seat; kind: Action['kind']; label: string; card?: CardRef; split?: { id: string; amount: number }[]; state: SeatState }
export interface OverMsg { t: 'over'; you: Seat; winner: Seat | null; outcome: string; round: number; steps: number }
export interface EndMsg { t: 'end'; winner: Seat | null; outcome: string; round: number; steps: number; error: string | null; by: Seat | null; conceded: boolean; replay: string | null }
export type TableMsg = HelloMsg | DecideMsg | MoveMsg | OverMsg | EndMsg;

export interface Act { t: 'act'; seq: number; i: number; split?: { id: string; amount: number }[] }

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

/** Engine prompt texts as a sentence: "Choose an action", a menu title, or a card prompt. */
export function promptText(m: DecideMsg): string {
    const p = m.prompt;
    if (p.actionWindow) {
        return 'Your action';
    }
    return (p.promptTitle && p.title && p.promptTitle !== p.title ? `${p.promptTitle}: ${p.title}` : p.title ?? p.promptTitle) ?? 'Choose';
}
