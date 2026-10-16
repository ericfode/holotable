import { useLayoutEffect, useState, type RefObject } from 'react';
import { tableCardSize } from './tableLayout';

/** Measure the viewport/container, not the changing board or prompt's content height. */
export function useBoardSpace(ref: RefObject<HTMLElement | null>, fitViewport = false) {
    const [size, setSize] = useState({ unit: 100, hand: 72 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => {
            const surface = el.closest<HTMLElement>('.fullscreen-surface');
            const expanded = surface && surface.dataset.screenMode !== 'inline';
            // Scrolling a crowded table must not change the viewport budget on the next resize.
            const top = el.getBoundingClientRect().top + (expanded ? surface.scrollTop : window.scrollY);
            const height = Math.max(360, window.innerHeight - (fitViewport ? top : 80) - 8);
            if (fitViewport) el.parentElement?.style.setProperty('--table-height', `${Math.round(height)}px`);
            const next = tableCardSize(el.clientWidth, height);
            setSize(old => old.unit === next.unit && old.hand === next.hand ? old : next);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        window.addEventListener('resize', measure);
        return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
    }, [ref, fitViewport]);
    return size;
}
