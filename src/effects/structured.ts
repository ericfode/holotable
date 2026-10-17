import * as index from './generated/kesselAnimations.json';
import type { CardRef, Seat, Snapshot, UnitRef } from '../data/types';
import type { CardEffectCue, CardEffectDefinition, CardEffectOutcome } from './types';

export type StructuredRecipe = 'damage' | 'heal' | 'defeat' | 'return' | 'ready' | 'exhaust' | 'resource' | 'buff' | 'debuff' | 'shield' | 'draw' | 'discard' | 'mill' | 'recover' | 'play' | 'control';
export interface StructuredCard {
    id: string; name: string; prints: string[]; recipe: StructuredRecipe | null; recipes: StructuredRecipe[]; types: string[]; unsupported: string[]; programs: unknown[];
    ability: unknown; sourceHash: string; dataHash: string;
}
export const STRUCTURED_ANIMATION_COVERAGE = index.coverage;
export const STRUCTURED_ANIMATION_SOURCE = index.source;
const cards = index.cards as unknown as StructuredCard[];
const byPrint = new Map(cards.flatMap(card => card.prints.map(print => [print, card] as const)));
/** Exact print identities only. A known title does not resolve an unknown print. */
export function structuredCard(card: CardRef | null): StructuredCard | undefined {
    return card?.s ? byPrint.get(card.s.toUpperCase().replace(/[- ]/g, '_')) : undefined;
}
const colors: Record<StructuredRecipe, string> = { damage: '#ff815f', heal: '#6bdca9', defeat: '#ff627e', return: '#87c8ff', ready: '#ffc267', exhaust: '#cba0ff', resource: '#91e39a', buff: '#6bdca9', debuff: '#b59aff', shield: '#81c9ff', draw: '#91d9e6', discard: '#f8bd68', mill: '#f8bd68', recover: '#b8e9b6', play: '#83dfbd', control: '#dcacef' };
export function structuredDefinition(card: CardRef): CardEffectDefinition | undefined {
    const spec = structuredCard(card);
    return spec && { id: `structured:${spec.id}`, name: spec.name, setCode: card.s!, family: ['damage', 'defeat'].includes(spec.recipe ?? '') ? 'damage' : 'support',
        color: colors[spec.recipe ?? 'draw'], description: 'Recorded outcomes using a shared card-effect recipe.', visual: 'structured', durationMs: 2400 };
}

type Located = { card: CardRef; seat: Seat; zone: string; host?: UnitRef };
/** Physical zones only: deployed leader summaries are aliases of the arena card, not a second object. */
function locate(state: Snapshot, id: string): Located[] {
    return (['p1', 'p2'] as Seat[]).flatMap(seat => {
        const p = state.players[seat];
        return [...(['ground', 'space', 'hand', 'discard'] as const).flatMap(zone => p[zone].flatMap(card => [{ card, seat, zone },
                ...(unit(card) ? (card.u ?? []).map(upgrade => ({ card: upgrade, seat, zone: 'attachment', host: card })) : []),
                ...(unit(card) ? (card.cap ?? []).map(captive => ({ card: captive, seat, zone: 'capture', host: card })) : [])])),
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
    if (outcome.kind === 'resource' && !outcome.card && outcome.zone === 'resources') {
        const physical = new Set((cue.outcomes ?? []).filter(o => o.kind === 'resource' && o.seat === outcome.seat && o.card?.id).map(o => o.card!.id));
        if ((cue.outcomes ?? []).filter(o => o.kind === 'resource' && o.seat === outcome.seat && !o.card).length !== 1) return null;
        const delta = after.players[outcome.seat].res.total - before.players[outcome.seat].res.total - physical.size;
        return delta > 0 && delta === outcome.amount ? { kind: 'resource', card: null, seat: outcome.seat, zone: 'resources', amount: delta, label: `${delta} RESOURCE ADDED` } : null;
    }
    if ((outcome.kind === 'draw' || outcome.kind === 'mill') && typeof outcome.amount === 'number' && Number.isInteger(outcome.amount) && outcome.amount > 0) {
        const a = before.players[outcome.seat], b = after.players[outcome.seat], zone = outcome.kind === 'draw' ? 'hand' : 'discard';
        const arriving = b[zone].filter(card => {
            if (!card.id || locate(after, card.id).length !== 1) return false;
            const prior = locate(before, card.id);
            return prior.length === 0 || prior.length === 1 && prior[0].zone === 'deck' && prior[0].seat === outcome.seat;
        });
        const deckReceipts = (cue.outcomes ?? []).filter(o => ['draw', 'mill'].includes(o.kind) && o.seat === outcome.seat && !o.prevented);
        const claimed = deckReceipts.reduce((total, o) => total + (typeof o.amount === 'number' && o.amount > 0 ? o.amount : Infinity), 0);
        if (claimed > a.deck - b.deck || deckReceipts.filter(o => o.kind === outcome.kind).length !== 1
            || a.knownDeck && a.knownDeck.length !== a.deck || b.knownDeck && b.knownDeck.length !== b.deck) return null;
        if (a.deck - b.deck < outcome.amount || arriving.length !== outcome.amount
            || a.knownDeck && arriving.some(card => !a.knownDeck!.some(c => c.id === card.id))) return null;
        return { kind: outcome.kind, card: null, seat: outcome.seat, zone, amount: outcome.amount,
            label: `${outcome.kind === 'draw' ? 'DRAW' : 'MILL'} ${outcome.amount}` };
    }
    if (!outcome.card?.id) return null;
    const old = locate(before, outcome.card.id), now = locate(after, outcome.card.id);
    // A seat view may first reveal a physical body when it reaches an arena. The
    // landing is known; its hidden origin and the causing card remain unknown.
    if (outcome.kind === 'play' && outcome.entryType === 'observed' && !cue.source && old.length === 0 && now.length === 1) {
        const b = now[0];
        if (!arena(b) || !unit(b.card) || b.seat !== outcome.seat || b.zone !== outcome.zone
            || outcome.card.n !== b.card.n || outcome.card.s !== b.card.s || outcome.fromSeat || outcome.fromZone) return null;
        return { kind: 'play', entryType: 'observed', card: b.card, unit: b.card, seat: b.seat,
            zone: b.zone as 'ground' | 'space', entersReady: !b.card.x, amount: 1, label: 'ENTERED ARENA' };
    }
    if (old.length !== 1 || now.length !== 1) return null;
    const a = old[0], b = now[0];
    if ((['return', 'resource', 'discard', 'recover', 'play', 'control', 'defeat'].includes(outcome.kind) && ((outcome.fromSeat && outcome.fromSeat !== a.seat) || (outcome.fromZone && outcome.fromZone !== a.zone)))
        || (outcome.ownerSeat && outcome.ownerSeat !== (['control', 'play'].includes(outcome.kind) ? b.card.owner : b.seat))
        || (outcome.kind !== 'play' && outcome.incarnation && outcome.incarnation !== (a.card as UnitRef).incarnation)
        || (outcome.kind !== 'play' && (outcome.card as UnitRef).incarnation && (outcome.card as UnitRef).incarnation !== (a.card as UnitRef).incarnation)) return null;
    if (a.card.s !== b.card.s || a.card.n !== b.card.n || outcome.card.s !== a.card.s || outcome.card.n !== a.card.n) return null;
    const route = { ...outcome, card: a.card, fromSeat: a.seat, fromZone: a.zone as CardEffectOutcome['fromZone'], ownerSeat: ['control', 'play'].includes(outcome.kind) ? b.card.owner : b.seat };
    if (outcome.kind === 'discard' && ['hand', 'resources'].includes(a.zone) && b.zone === 'discard' && outcome.zone === 'discard' && outcome.seat === b.seat) return route;
    if (outcome.kind === 'recover' && a.zone === 'discard' && ['hand', 'deck'].includes(b.zone) && outcome.zone === b.zone && outcome.seat === b.seat) return { ...route, destination: b.zone === 'hand' ? 'hand' : undefined, label: b.zone === 'deck' ? 'RECOVERED TO DECK' : 'RECOVERED TO HAND' };
    if (outcome.kind === 'play' && ['hand', 'discard', 'resources', 'deck', 'leader'].includes(a.zone) && arena(b) && unit(b.card) && outcome.zone === b.zone && outcome.seat === b.seat) {
        return { ...route, card: b.card, unit: b.card, entersReady: !b.card.x, amount: 1, label: 'ENTERED ARENA' };
    }
    if (outcome.kind === 'control' && arena(a) && a.zone === b.zone && a.seat !== b.seat && unit(a.card) && unit(b.card)
        && a.card.incarnation === b.card.incarnation && outcome.seat === b.seat && outcome.zone === b.zone) return { ...route, card: b.card, unit: b.card, amount: 1, label: 'CONTROLLER CHANGED' };
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
    if (outcome.kind === 'shield') {
        const count = (body: UnitRef) => (body.u ?? []).filter(c => c.t === 1 && c.n.toLowerCase() === 'shield').length;
        const oldIds = new Set((a.card.u ?? []).filter(c => c.t === 1 && c.n.toLowerCase() === 'shield').map(c => c.id));
        const shields = (b.card.u ?? []).filter(c => c.t === 1 && c.n.toLowerCase() === 'shield');
        if (shields.some(c => c.id && (locate(after, c.id).length !== 1 || !oldIds.has(c.id) && (locate(before, c.id).length > 0 || before.mostRecentIncarnations?.[c.id])))) return null;
        const delta = count(b.card) - count(a.card);
        return delta > 0 && delta === outcome.amount ? { kind: 'shield', card: b.card, seat: b.seat, zone: b.zone as 'ground' | 'space', amount: delta, label: `${delta} SHIELD ADDED` } : null;
    }
    if (outcome.kind === 'buff' || outcome.kind === 'debuff') {
        const dp = b.card.p - a.card.p, dh = b.card.h - a.card.h;
        const expected = String(outcome.amount ?? '').replaceAll('−', '-').match(/^([+-]?\d+)\/([+-]?\d+)$/);
        const sign = outcome.kind === 'buff' ? 1 : -1;
        if (!expected || Number(expected[1]) !== (sign > 0 ? Math.max(0, dp) : Math.min(0, dp)) || Number(expected[2]) !== (sign > 0 ? Math.max(0, dh) : Math.min(0, dh))
            || !(sign * dp > 0 || sign * dh > 0)) return null;
        return { kind: outcome.kind, card: b.card, seat: b.seat, zone: b.zone as 'ground' | 'space', amount: outcome.amount, label: `${outcome.amount} STATS` };
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
    if (!spec) fallbacks.push('unsupported-definition');
    else for (const kind of spec.unsupported) fallbacks.push(`unsupported-json:${kind}`);
    const sourceBefore = cue.source?.id && cue.transition ? locate(cue.transition.before, cue.source.id) : [];
    const sourceKnown = !!spec && sourceBefore.length === 1 && sourceBefore[0].seat === cue.seat && sourceBefore[0].card.s === cue.source?.s
        && sourceBefore[0].card.n === cue.source?.n && cue.source.n.toLowerCase().replace(/[^a-z0-9]/g, '') === spec.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!sourceKnown) fallbacks.push('insufficient-source-evidence');
    const outcomes = (cue.outcomes ?? []).filter(o => !o.sourceDisposal).flatMap(outcome => {
        const checked = supportedReceipt(outcome, cue);
        if (!checked) { fallbacks.push(`insufficient-physical-evidence:${outcome.kind}`); return []; }
        if (!spec?.recipes.includes(outcome.kind as StructuredRecipe) && !(spec?.recipes.includes('damage') && outcome.kind === 'defeat')) fallbacks.push(`observed-only:${outcome.kind}`);
        if (outcome.kind === 'resource' && !outcome.card) fallbacks.push('aggregate-only:resource');
        return [checked];
    });
    if (!outcomes.length) fallbacks.push('no-resolved-outcomes');
    // Disposal is observed separately from payment. Never leave a resolved event visibly in its former hand.
    const sourceAfter = sourceKnown && cue.source?.id && cue.transition ? locate(cue.transition.after, cue.source.id) : [];
    if (sourceBefore.length === 1 && sourceAfter.length === 1 && sourceBefore[0].zone === 'hand' && sourceAfter[0].zone === 'discard'
        && sourceAfter[0].card.s === cue.source?.s && sourceAfter[0].card.n === cue.source?.n) {
        outcomes.push({ kind: 'discard', card: sourceBefore[0].card, seat: sourceAfter[0].seat, fromSeat: sourceBefore[0].seat,
            fromZone: 'hand', zone: 'discard', amount: 1, sourceDisposal: true, label: 'Event discarded' });
    }
    return { ...cue, outcomes, structured: { recipe: spec?.recipe ?? null, recipes: [...new Set(outcomes.filter(o => !o.sourceDisposal).map(o => o.kind as StructuredRecipe))], sourceKnown, fallbacks: [...new Set(fallbacks)] } };
}

/** Keep detailed diagnostics inspectable without putting compiler internals into the table caption. */
export function structuredFallbackText(reasons: readonly string[]): string {
    if (reasons.includes('unsupported-definition')) return 'No JSON recipe is available; showing verified observed changes only.';
    if (reasons.some(reason => reason.startsWith('insufficient-physical'))) return 'Some physical details are missing; showing verified changes only.';
    if (reasons.some(reason => reason.startsWith('unsupported-json'))) return 'Some mechanics have no shared recipe; showing verified changes only.';
    if (reasons.includes('aggregate-only:resource')) return 'Resource count confirmed; card identity and readiness are unavailable.';
    if (reasons.includes('insufficient-source-evidence')) return 'Source identity is unavailable; showing verified local changes only.';
    if (reasons.includes('no-resolved-outcomes')) return 'No resolved effects are available; the supplied ending remains authoritative.';
    return 'Verified observed changes only; additional effect details are unavailable.';
}
