import type { Action } from '../data/actions';
import type { CardRef, Game, Seat, Snapshot } from '../data/types';
import type { MoveMsg } from '../play/protocol';
import { resolveCardAnimation, routeAnimationCue } from './animationResolver';
import { observedOutcomes } from './outcomes';
import { structuredCard } from './structured';
import type { CardEffectCue } from './types';

/** Live tables expose less than a replay: admit only physical, visible hand plays.
 * No attack/ability is guessed from a card click. A target-choice continuation may
 * provide the first resolved receipt, but a turn/phase/rewind boundary drops it.
 */
export function liveCardEffects() {
    let pending: { source: CardRef; seat: Seat; cls: Action['cls']; before: Snapshot } | null = null;
    let serial = 0;
    return {
        clear() { pending = null; },
        move(before: Snapshot | null, after: Snapshot, move: MoveMsg): CardEffectCue | null {
            if (!before || before.phase !== 'action' || before.round !== after.round || before.phase !== after.phase) { pending = null; return null; }
            if (pending?.seat !== move.seat) pending = null;
            const visible = (snapshot: Snapshot) => Object.values(snapshot.players).flatMap(p => [...p.hand, ...p.discard, ...(p.resources ?? []), ...p.ground, ...p.space, ...[...p.ground, ...p.space].flatMap(c => c.u ?? [])]);
            const same = (a: CardRef, b: CardRef) => a.id === b.id && a.s === b.s && a.n === b.n;
            const candidates = move.card?.id ? before.players[move.seat].hand.filter(c => c.id === move.card!.id) : [];
            const source = candidates.length === 1 && visible(before).filter(c => c.id === move.card!.id).length === 1 && same(candidates[0], move.card!) ? candidates[0] : undefined;
            const spec = structuredCard(source ?? null);
            const resourced = source?.id && after.players[move.seat].resources?.some(c => c.id === source.id);
            if (resourced) { pending = null; return null; }
            if (source && spec) {
                const cls = spec.types.includes('event') ? 'play-event' : spec.types.includes('unit') ? 'play-unit' : spec.types.includes('upgrade') ? 'play-upgrade' : null;
                if (cls) pending = { source, seat: move.seat, cls, before };
            }
            if (!pending) return null;
            const action: Action = { index: 1, until: 1, seat: pending.seat, cls: pending.cls, card: pending.source, target: null,
                outcome: { baseDamage: 0, defeated: 0, entered: 0 }, swing: 0 };
            const game: Game = { header: { t: 'header', v: 1, seed: 0, engine: null, players: [] },
                steps: [{ t: 'step', n: 0, state: pending.before }, { t: 'step', n: move.n, state: after }], end: null };
            // Require a witnessed play destination before attributing any continuation.
            const player = after.players[pending.seat];
            const destinations = visible(after).filter(c => c.id === pending!.source.id);
            if (destinations.length !== 1 || !same(destinations[0], pending.source)) { pending = null; return null; }
            const destination = pending.cls === 'play-event' ? player.discard.some(c => c.id === pending!.source.id)
                : [...player.ground, ...player.space].some(c => c.id === pending!.source.id || c.u?.some(u => u.id === pending!.source.id));
            if (!destination) return null;
            const outcomes = observedOutcomes(game, action);
            // Source disposal alone is not a resolved effect. Unknown/hidden receipts stay unanimated.
            const useful = outcomes.some(o => !(o.kind === 'discard' && o.card?.id === pending!.source.id));
            if (!useful) return null;
            const { definition } = resolveCardAnimation(pending.source);
            // Shared outcome vocabulary is safer than a cinematic override whose choice/stage is absent here.
            const cue = routeAnimationCue({ definition, source: pending.source, seat: pending.seat, target: null, outcomes,
                key: `live:${move.n}:${++serial}`, transition: { before: pending.before, after } }, 'shared');
            pending = null;
            return cue;
        }
    };
}
