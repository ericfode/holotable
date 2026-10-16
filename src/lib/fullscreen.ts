export type ScreenMode = 'inline' | 'fullscreen' | 'maximized';
export interface FullscreenState { mode: ScreenMode; supported: boolean; pending: boolean; notice: string }
export const inlineScreen: FullscreenState = { mode: 'inline', supported: false, pending: false, notice: '' };

/** A single viewer's browser lifecycle; no request runs until toggle is called by a user gesture. */
export function fullscreenSession(el: HTMLElement, onChange: (state: FullscreenState) => void) {
    let state = { ...inlineScreen, supported: typeof el.requestFullscreen === 'function' && el.ownerDocument.fullscreenEnabled };
    const publish = (patch: Partial<FullscreenState>) => { state = { ...state, ...patch }; onChange(state); };
    const doc = el.ownerDocument;
    const win = doc.defaultView!;
    const tree = el.getRootNode() as Document | ShadowRoot;
    // document.fullscreenElement is the host when the target is inside a shadow root.
    const ownsFullscreen = () => tree.fullscreenElement === el;
    const native = typeof el.requestFullscreen === 'function' && doc.fullscreenEnabled;
    const ancestors: Element[] = [];
    for (let parent: Element | null = el; parent; parent = parent.parentElement ?? (parent.getRootNode() as ShadowRoot).host ?? null) {
        ancestors.push(parent);
    }
    // A native fullscreen element is in the top layer: it can keep its own rect after its host is hidden.
    const shown = () => el.isConnected && !!el.getClientRects().length && ancestors.every((parent) => {
        const style = win.getComputedStyle(parent);
        return !parent.hasAttribute('hidden') && style.display !== 'none' && style.visibility !== 'hidden';
    });

    let alive = true;
    let busy = false;
    let restoring = false;
    let current: ScreenMode = 'inline';
    let unlock: (() => void) | null = null;
    const focusToggle = () => el.querySelector<HTMLButtonElement>('[data-fullscreen-toggle]')?.focus({ preventScroll: true });
    const change = (next: ScreenMode) => {
        const wasActive = current !== 'inline';
        current = next;
        if (next !== 'maximized') {
            unlock?.();
            unlock = null;
        }
        if (alive) {
            publish({ mode: next });
            if (next === 'inline' && wasActive) focusToggle();
            // The table's prompt docking also measures the surrounding page header on resize.
            win.requestAnimationFrame(() => { if (alive) win.dispatchEvent(new Event('resize')); });
        }
    };
    const maximize = () => {
        // A hidden/unmounted viewer or a different fullscreen target interrupted this request.
        if (!alive || !shown() || doc.visibilityState === 'hidden' || doc.fullscreenElement) return;
        // Keep scrolling inside the expanded viewer; restore the host page's exact overflow styles on exit.
        const saved = [doc.documentElement, doc.body].map((e) => ({
            e, value: e.style.getPropertyValue('overflow'), priority: e.style.getPropertyPriority('overflow')
        }));
        saved.forEach(({ e }) => e.style.setProperty('overflow', 'hidden'));
        unlock = () => saved.forEach(({ e, value, priority }) => {
            if (value) e.style.setProperty('overflow', value, priority);
            else e.style.removeProperty('overflow');
        });
        publish({ notice: 'Maximized within this tab. Browser controls remain visible.' });
        change('maximized');
    };
    const sync = () => {
        if (!alive) return;
        if (ownsFullscreen()) {
            if (!shown() || doc.visibilityState === 'hidden') {
                restoreHidden();
                return;
            }
            publish({ notice: '' });
            change('fullscreen');
        } else if (current === 'fullscreen') {
            publish({ notice: '' });
            change('inline');
        }
    };
    const exit = () => {
        if (current === 'maximized') {
            publish({ notice: '' });
            change('inline');
            return;
        }
        return doc.exitFullscreen();
    };
    const toggle = async () => {
        if (!alive || busy) return;
        busy = true;
        publish({ pending: true });
        const entering = current === 'inline';
        try {
            if (!entering) await exit();
            else if (native) await el.requestFullscreen(); // called directly by the button's user gesture
            else maximize();
            if (!alive) {
                // Navigation can unmount this viewer while the browser's request is still pending.
                if (ownsFullscreen()) await doc.exitFullscreen();
                return;
            }
            sync();
        } catch {
            if (alive) {
                if (entering && !ownsFullscreen()) maximize();
                else publish({ notice: 'Could not leave fullscreen. Use your browser’s exit fullscreen control or Escape.' });
            }
        } finally {
            busy = false;
            if (alive) publish({ pending: false });
        }
    };
    const onKey = (e: KeyboardEvent) => {
        // Capture Escape before game shortcuts: restoring the layout must not also make/undo a move.
        if (e.key === 'Escape' && current === 'maximized') {
            e.preventDefault();
            e.stopImmediatePropagation();
            void toggle();
        }
    };
    const restoreHidden = () => {
        if (shown() && doc.visibilityState !== 'hidden') return;
        if (current === 'maximized') {
            publish({ notice: '' });
            change('inline');
        }
        if (ownsFullscreen() && !restoring) {
            restoring = true;
            void doc.exitFullscreen().then(() => {
                restoring = false;
                sync();
            }, () => {
                restoring = false;
                if (alive) publish({ notice: 'Use Escape to leave fullscreen before opening another view.' });
            });
        }
    };
    // Hosts may hide an embedded table when switching to games/replays without unmounting it.
    const observer = new win.MutationObserver(restoreHidden);
    for (const parent of ancestors) {
        observer.observe(parent, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
    }
    doc.addEventListener('visibilitychange', restoreHidden);
    doc.addEventListener('fullscreenchange', sync);
    win.addEventListener('keydown', onKey, { capture: true });
    onChange(state);
    return { toggle, destroy: () => {
        alive = false;
        observer.disconnect();
        doc.removeEventListener('visibilitychange', restoreHidden);
        doc.removeEventListener('fullscreenchange', sync);
        win.removeEventListener('keydown', onKey, { capture: true });
        unlock?.();
        if (ownsFullscreen()) void doc.exitFullscreen().catch(() => undefined);
    } };
}
