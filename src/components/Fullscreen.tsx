import { createContext, useContext, useEffect, useRef, useState, type HTMLAttributes, type RefObject } from 'react';
import { Maximize, Minimize } from 'lucide-react';

import { fullscreenSession, inlineScreen, type FullscreenState } from '../lib/fullscreen';
const FullscreenContext = createContext<{
    state: FullscreenState; toggle: () => void;
} | null>(null);

/** Fullscreen the entire experience, including its dialogs, inside or outside the kit's shadow root. */
export function FullscreenSurface({ targetRef, children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & {
    targetRef?: RefObject<HTMLDivElement | null>;
}) {
    const ownRef = useRef<HTMLDivElement>(null);
    const root = targetRef ?? ownRef;
    const [state, setState] = useState(inlineScreen);
    const controller = useRef<ReturnType<typeof fullscreenSession> | null>(null);
    useEffect(() => {
        const el = root.current;
        if (!el) return;
        const session = fullscreenSession(el, setState);
        controller.current = session;
        return () => { controller.current = null; session.destroy(); };
    }, [root]);

    return (
        <FullscreenContext.Provider value={{ state, toggle: () => controller.current?.toggle() }}>
            <div {...props} ref={root} className={`fullscreen-surface ${className}`} data-screen-mode={state.mode}>
                {children}
            </div>
        </FullscreenContext.Provider>
    );
}

export function FullscreenButton({ className = 'btn !h-8' }: { className?: string }) {
    const state = useContext(FullscreenContext);
    if (!state) return null;
    const { state: { mode, supported, pending, notice }, toggle } = state;
    const active = mode !== 'inline';
    const label = mode === 'maximized' ? 'Restore layout' : active ? 'Exit fullscreen' : supported ? 'Fullscreen' : 'Maximize';
    return (
        <span className="fullscreen-control">
            <button type="button" className={className} data-fullscreen-toggle aria-label={label} aria-pressed={active}
                disabled={pending} onClick={toggle} title={active ? `${label} (Esc)` : supported ? 'Open the whole table in fullscreen' : 'Maximize within this tab; browser controls remain visible'}>
                {active ? <Minimize size={14} /> : <Maximize size={14} />}<span>{label}</span>
            </button>
            <span role="status" className="fullscreen-notice text-xs text-dim">{notice}</span>
        </span>
    );
}
