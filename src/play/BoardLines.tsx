import { useLayoutEffect, useMemo, useState, type RefObject } from 'react';
import type { Seat } from '../data/types';

/** One move of the other side, as BoardLines draws it: the card it was made with (when the person can see it) and its words. */
export interface Trail { id?: string; text: string }

/** A card on screen, relative to the root: its box and the side of the board it sits on. */
interface Box { x: number; y: number; w: number; h: number; seat: Seat | null }
interface Boxes { w: number; h: number; at: Map<string, Box> }

// cards keep moving for a while after a board change (layout animations): measured again on every frame this long
const SETTLE_MS = 900;
const BUBBLE_W = 230;

const sameBoxes = (a: Boxes | null, b: Boxes) => !!a && a.w === b.w && a.h === b.h && a.at.size === b.at.size
    && [...b.at].every(([id, x]) => {
        const y = a.at.get(id);
        return !!y && y.x === x.x && y.y === x.y && y.w === x.w && y.h === x.h && y.seat === x.seat;
    });

const mid = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** A gentle curve from one card's middle to the edge of another, so an arrow's head stays visible on the target. */
function curve(a: Box, b: Box): string {
    const p = mid(a);
    const q = mid(b);
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    // stop short of the target's middle, near its edge
    const stop = Math.min(len * 0.45, Math.min(b.w, b.h) * 0.42);
    const ex = q.x - (dx / len) * stop;
    const ey = q.y - (dy / len) * stop;
    // bow sideways by a tenth of the length
    const cx = (p.x + ex) / 2 - (dy / len) * len * 0.1;
    const cy = (p.y + ey) / 2 + (dx / len) * len * 0.1;
    return `M${p.x.toFixed(1)},${p.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
}

/**
 * Lines over the board in play mode, measured from the cards on screen (data-effect-id) inside `root`:
 *  - the other side's moves since the person's last one (trail): an arrow from its card to the person's card it acted on
 *    next (an attacker to its target), and a ring on any other card it played or used;
 *  - while a card's ability asks the person something (asking): the question in a bubble over that card, and dashed
 *    lines from it to the cards that answer it.
 * It takes no taps: everything under it stays clickable.
 */
export function BoardLines({ root, step, trail, botSeat, asking, answers, question }: {
    root: RefObject<HTMLElement | null>; step: number; trail: Trail[]; botSeat: Seat; asking: string | null; answers: string[]; question: string | null;
}) {
    const [boxes, setBoxes] = useState<Boxes | null>(null);
    const want = useMemo(() => [...new Set([...trail.map((t) => t.id ?? ''), ...(asking ? [asking, ...answers] : [])].filter(Boolean))], [trail, asking, answers]);
    const wantKey = want.join('|');
    useLayoutEffect(() => {
        const el = root.current;
        if (!el || !want.length) {
            setBoxes(null);
            return;
        }
        const measure = () => {
            const base = el.getBoundingClientRect();
            const at = new Map<string, Box>();
            for (const id of want) {
                const card = el.querySelector(`[data-effect-id="${CSS.escape(id)}"]`);
                let r = card?.getBoundingClientRect();
                const field = card?.closest('.side-field');
                if (r && field) {
                    const clip = field.getBoundingClientRect();
                    const left = Math.max(r.left, clip.left), top = Math.max(r.top, clip.top);
                    const right = Math.min(r.right, clip.right), bottom = Math.min(r.bottom, clip.bottom);
                    r = new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
                }
                if (card && r && r.width > 0 && r.height > 0) {
                    const seat = card.closest('[data-effect-seat]')?.getAttribute('data-effect-seat');
                    at.set(id, { x: Math.round(r.left - base.left), y: Math.round(r.top - base.top), w: Math.round(r.width), h: Math.round(r.height), seat: seat === 'p1' || seat === 'p2' ? seat : null });
                }
            }
            const next = { w: Math.round(base.width), h: Math.round(base.height), at };
            setBoxes((prev) => (sameBoxes(prev, next) ? prev : next));
        };
        const until = performance.now() + SETTLE_MS;
        let frame = 0;
        const tick = () => {
            measure();
            if (performance.now() < until) {
                frame = requestAnimationFrame(tick);
            }
        };
        tick();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        el.addEventListener('scroll', measure, true);
        return () => {
            cancelAnimationFrame(frame);
            ro.disconnect();
            el.removeEventListener('scroll', measure, true);
        };
        // want is read through wantKey; step: the board changed, so cards moved
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [root, wantKey, step]);

    if (!boxes || !boxes.at.size) {
        return null;
    }
    const at = boxes.at;
    // the trail: an arrow from a card on the other side to the person's card it acted on next; a ring on any other
    const seen = trail.filter((t) => t.id && at.has(t.id)).map((t) => at.get(t.id!)!);
    const arrows: [Box, Box][] = [];
    const rings = new Set<Box>();
    seen.forEach((b, k) => {
        const next = seen[k + 1];
        if (next && b.seat === botSeat && next.seat !== botSeat) {
            arrows.push([b, next]);
        } else if (!arrows.some(([, to]) => to === b)) {
            rings.add(b);
        }
    });
    const ask = asking ? at.get(asking) ?? null : null;
    const lines = ask ? answers.map((id) => at.get(id)).filter((b): b is Box => !!b).slice(0, 10) : [];
    const color = `var(--color-${botSeat})`;
    let bubble = null;
    if (ask && question) {
        const left = Math.max(BUBBLE_W / 2 + 4, Math.min(boxes.w - BUBBLE_W / 2 - 4, ask.x + ask.w / 2));
        const above = ask.y > 64;
        bubble = (
            <div className={`ask-bubble ${above ? 'above' : 'below'}`} style={{ left, top: above ? ask.y : ask.y + ask.h, maxWidth: BUBBLE_W }}>
                {question}
            </div>
        );
    }
    return (
        <div className="board-lines" aria-hidden="true">
            <svg width={boxes.w} height={boxes.h} viewBox={`0 0 ${boxes.w} ${boxes.h}`}>
                <defs>
                    <marker id="trail-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                        <path d="M0,0 L10,5 L0,10 z" style={{ fill: color }} />
                    </marker>
                </defs>
                {lines.map((b, i) => <path key={`ask${i}`} className="ask-line" d={curve(ask!, b)} />)}
                {[...rings].map((b, i) => <rect key={`ring${i}`} className="trail-ring" x={b.x - 3} y={b.y - 3} width={b.w + 6} height={b.h + 6} rx={9} style={{ stroke: color }} />)}
                {arrows.map(([a, b], i) => <path key={`arrow${i}`} className="trail-arrow" d={curve(a, b)} markerEnd="url(#trail-head)" style={{ stroke: color }} />)}
            </svg>
            {bubble}
        </div>
    );
}
