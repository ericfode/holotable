/**
 * How the person last pressed something: 'touch', 'mouse' or 'pen' (PointerEvent.pointerType), read page-wide. A touch
 * screen has no hover, so a tap on a card opens it instead of hovering or picking it, and a move made by touch waits a
 * moment with an Undo button (PlayPage). Keys never count as touch.
 */
let last = 'mouse';
if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', (e) => {
        last = e.pointerType || 'mouse';
    }, { capture: true, passive: true });
}

/** The last press was a finger on a touch screen. */
export const byTouch = () => last === 'touch';

/** Focus the person can see as focus (the keyboard's Tab, or a key that moved it); a tap or a click gives none. */
export function keyboardFocus(el: Element): boolean {
    try {
        return el.matches(':focus-visible');
    } catch {
        return true;
    }
}
