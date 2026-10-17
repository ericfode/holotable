import type { Seat } from '../data/types';

/** Orientation belongs to the viewer, never to initiative, colour, or the player currently acting. */
export function boardSeats(bottom: Seat = 'p1'): [Seat, Seat] {
    return [bottom === 'p1' ? 'p2' : 'p1', bottom];
}

/** Container-space budget. Only a bounded field supplies height; ordinary embeds grow in page flow. */
export function tableCardSize(width: number, fieldHeight?: number) {
    const unit = Math.round(Math.max(72, Math.min(150, Math.max(90, width / 9),
        fieldHeight === undefined ? Infinity : Math.max(72, (fieldHeight - 32) / 1.4))));
    // Independent of unit height: measuring a bounded field must not resize its hand and create a feedback loop.
    return { unit, hand: Math.round(Math.max(72, Math.min(90, width / 16))) };
}
