import type { Seat } from '../data/types';

/** Orientation belongs to the viewer, never to initiative, colour, or the player currently acting. */
export function boardSeats(bottom: Seat = 'p1'): [Seat, Seat] {
    return [bottom === 'p1' ? 'p2' : 'p1', bottom];
}

/** Screen-space budget, independent of prompt/status content and turn changes. */
export function tableCardSize(width: number, height: number) {
    const unit = Math.round(Math.max(90, Math.min(150, width / 9, height / 5.6)));
    return { unit, hand: Math.round(Math.max(72, Math.min(90, unit * .60))) };
}
