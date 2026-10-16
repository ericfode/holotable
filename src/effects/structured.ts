import * as index from './generated/kesselAnimations.json';
import type { CardRef, Seat, Snapshot, UnitRef } from '../data/types';
import type { CardEffectCue, CardEffectDefinition, CardEffectOutcome } from './types';

export type StructuredRecipe = 'damage' | 'heal' | 'defeat' | 'return' | 'ready' | 'exhaust' | 'resource';
export interface StructuredCard {
    id: string; name: string; prints: string[]; recipe: StructuredRecipe;
    ability: unknown; sourceHash: string; dataHash: string;
}
export const STRUCTURED_ANIMATION_COVERAGE = index.coverage;
export const STRUCTURED_ANIMATION_SOURCE = index.source;
const cards = index.cards as StructuredCard[];
const byPrint = new Map(cards.flatMap(card => card.prints.map(print => [print, card] as const)));
/** Exact print identities only. A known title does not resolve an unknown print. */
export function structuredCard(card: CardRef | null): StructuredCard | undefined {
    return card?.s ? byPrint.get(card.s.toUpperCase().replace(/[- ]/g, '_')) : undefined;
}
const colors: Record<StructuredRecipe, string> = { damage: '#ff815f', heal: '#6bdca9', defeat: '#ff627e', return: '#87c8ff', ready: '#ffc267', exhaust: '#cba0ff', resource: '#91e39a' };
export function structuredDefinition(card: CardRef): CardEffectDefinition | undefined {
    const spec = structuredCard(card);
    return spec && { id: `structured:${spec.id}`, name: spec.name, setCode: card.s!, family: ['damage', 'defeat'].includes(spec.recipe) ? 'damage' : 'support',
        color: colors[spec.recipe], description: 'Recorded outcomes using a shared card-effect recipe.', visual: 'structured', durationMs: 2400 };
}

type Located = { card: CardRef; seat: Seat; zone: string };
/** Physical zones only: deployed leader summaries are aliases of the arena card, not a second object. */
function locate(state: Snapshot, id: string): Located[] {
    return (['p1', 'p2'] as Seat[]).flatMap(seat => {
        const p = state.players[seat];
        return [...(['ground', 'space', 'hand', 'discard'] as const).flatMap(zone => p[zone].flatMap(card => [{ card, seat, zone },
                ...(unit(card) ? (card.u ?? []).map(card => ({ card, seat, zone: 'attachment' })) : []),
                ...(unit(card) ? (card.cap ?? []).map(card => ({ card, seat, zone: 'capture' })) : [])])),
            { card: p.base, seat, zone: 'base' },
            ...(p.knownDeck ?? []).map(card => ({ card, seat, zone: 'deck' })),
            ...(p.resources ?? []).map(card => ({ card, seat, zone: 'resources' })),
            ...(p.leader && !p.leader.dep ? [{ card: p.leader, seat, zone: 'leader' }] : [])];
    }).filter(item => item.card.id === id);
}
const unit = (card: CardRef): card is UnitRef => 'p' in card && 'h' in card && 'd' in card;
const arena = (x: Located) => x.zone === 'ground' || x.zone === 'space';

/** Match an observed receipt to actual physical snapshots. Static target selectors/amounts never execute. */
function supportedReceipt(outcome: CardEffectOutcome, cue: CardEffectCue): CardEffectOutcome | null {
    if (!cue.transition || outcome.prevented) return null;
    const { before, after } = cue.transition;
    if (outcome.zone === 'base' && ['damage', 'heal'].includes(outcome.kind)) {
        const a = before.players[outcome.seat].base, b = after.players[outcome.seat].base;
        if ((a.id && (locate(before, a.id).length !== 1 || locate(after, a.id).length !== 1))
            || a.s !== b.s || a.n !== b.n || (a.id || b.id) && a.id !== b.id
            || outcome.card?.s !== b.s || outcome.card?.n !== b.n || outcome.card?.id !== b.id || a.hp !== b.hp) return null;
        const delta = outcome.kind === 'damage' ? b.d - a.d : a.d - b.d;
        return delta > 0 && delta === outcome.amount ? { ...outcome, card: b } : null;
    }
    if (!outcome.card?.id) return null;
    const old = locate(before, outcome.card.id), now = locate(after, outcome.card.id);
    if (old.length !== 1 || now.length !== 1) return null;
    const a = old[0], b = now[0];
    if ((outcome.fromSeat && outcome.fromSeat !== a.seat) || (outcome.fromZone && outcome.fromZone !== a.zone)
        || (outcome.ownerSeat && outcome.ownerSeat !== b.seat)
        || (outcome.incarnation && outcome.incarnation !== (a.card as UnitRef).incarnation)
        || ((outcome.card as UnitRef).incarnation && (outcome.card as UnitRef).incarnation !== (a.card as UnitRef).incarnation)) return null;
    if (a.card.s !== b.card.s || a.card.n !== b.card.n || outcome.card.s !== a.card.s || outcome.card.n !== a.card.n) return null;
    const route = { ...outcome, card: a.card, fromSeat: a.seat, fromZone: a.zone as CardEffectOutcome['fromZone'], ownerSeat: b.seat };
    if (outcome.kind === 'defeat' && arena(a) && (b.zone === 'discard' || b.zone === 'leader') && outcome.zone === b.zone
        && outcome.seat === a.seat && (!a.card.owner || a.card.owner === b.seat)
        && (b.zone !== 'leader' || 'x' in b.card && b.card.x === 1)) {
        return { ...route, seat: a.seat, zone: b.zone, ...(b.zone === 'leader' ? { leader: after.players[b.seat].leader! } : {}) };
    }
    if (outcome.kind === 'return' && arena(a) && b.zone === 'hand' && outcome.seat === b.seat && outcome.zone === 'hand'
        && (!outcome.destination || outcome.destination === 'hand') && (!a.card.owner || a.card.owner === b.seat)) return { ...route, destination: 'hand' };
    if (outcome.kind === 'resource' && b.zone === 'resources' && outcome.zone === 'resources' && outcome.seat === b.seat && a.zone !== b.zone) return { ...route, entersReady: !('x' in b.card && b.card.x === 1) };
    if (!arena(a) || a.zone !== b.zone || a.seat !== b.seat || outcome.seat !== b.seat || outcome.zone !== b.zone || !unit(a.card) || !unit(b.card)
        || a.card.incarnation !== b.card.incarnation) return null;
    if (outcome.kind === 'damage' || outcome.kind === 'heal') {
        const delta = outcome.kind === 'damage' ? b.card.d - a.card.d : a.card.d - b.card.d;
        return delta > 0 && delta === outcome.amount ? { ...outcome, card: b.card } : null;
    }
    if (outcome.kind === 'ready' || outcome.kind === 'exhaust') {
        const readied = a.card.x === 1 && !b.card.x, exhausted = !a.card.x && b.card.x === 1;
        return (outcome.kind === 'ready' ? readied : exhausted) ? outcome : null;
    }
    return null;
}

/** A presentation plan; the original recorded ending remains authoritative, including unsupported changes. */
export function planStructuredCue(cue: CardEffectCue): CardEffectCue {
    const spec = structuredCard(cue.source), fallbacks: string[] = [];
    if (!spec) return { ...cue, outcomes: [], structured: { recipe: null, fallbacks: ['unsupported-definition'] } };
    const sourceBefore = cue.source?.id && cue.transition ? locate(cue.transition.before, cue.source.id) : [];
    const sourceKnown = sourceBefore.length === 1 && sourceBefore[0].seat === cue.seat && sourceBefore[0].card.s === cue.source?.s
        && sourceBefore[0].card.n === cue.source?.n && cue.source.n.toLowerCase().replace(/[^a-z0-9]/g, '') === spec.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!sourceKnown) fallbacks.push('insufficient-source-evidence');
    const outcomes = (cue.outcomes ?? []).flatMap(outcome => {
        // Damage may be accompanied by an observed departure; do not invent lethal damage on a disappeared unit.
        if (outcome.kind !== spec.recipe && !(spec.recipe === 'damage' && outcome.kind === 'defeat')) {
            fallbacks.push(`unmapped-receipt:${outcome.kind}`); return [];
        }
        const checked = supportedReceipt(outcome, cue);
        if (!checked) { fallbacks.push(`insufficient-physical-evidence:${outcome.kind}`); return []; }
        return [checked];
    });
    if (!outcomes.length && !fallbacks.length) fallbacks.push('no-resolved-outcomes');
    // Disposal is observed separately from payment. Never leave a resolved event visibly in its former hand.
    const sourceAfter = sourceKnown && cue.source?.id && cue.transition ? locate(cue.transition.after, cue.source.id) : [];
    if (sourceBefore.length === 1 && sourceAfter.length === 1 && sourceBefore[0].zone === 'hand' && sourceAfter[0].zone === 'discard'
        && sourceAfter[0].card.s === cue.source?.s && sourceAfter[0].card.n === cue.source?.n) {
        outcomes.push({ kind: 'discard', card: sourceBefore[0].card, seat: sourceAfter[0].seat, fromSeat: sourceBefore[0].seat,
            fromZone: 'hand', zone: 'discard', amount: 1, sourceDisposal: true, label: 'Event discarded' });
    }
    return { ...cue, outcomes, structured: { recipe: spec.recipe, sourceKnown, fallbacks: [...new Set(fallbacks)] } };
}
