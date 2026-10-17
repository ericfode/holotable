import { useLayoutEffect, useState, type RefObject } from 'react';
import { tableCardSize } from './tableLayout';

/** Ordinary embeds size by their own width; fullscreen fields also have a real, bounded height. */
export function useBoardSpace(ref: RefObject<HTMLElement | null>) {
    const [size, setSize] = useState({ unit: 100, hand: 72 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const surface = el.closest<HTMLElement>('.fullscreen-surface');
        const observed = new Set<Element>();
        const measure = () => {
            const expanded = surface?.dataset.screenMode === 'fullscreen' || surface?.dataset.screenMode === 'maximized';
            const fields = [...el.querySelectorAll<HTMLElement>('.table-board .side-field')];
            for (const field of fields) if (!observed.has(field)) { observer.observe(field); observed.add(field); }
            const heights = expanded ? fields.map(field => field.clientHeight).filter(height => height > 0) : [];
            const next = tableCardSize(el.clientWidth, heights.length ? Math.min(...heights) : undefined);
            setSize(old => old.unit === next.unit && old.hand === next.hand ? old : next);
        };
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        const mode = new MutationObserver(measure);
        if (surface) mode.observe(surface, { attributes: true, attributeFilter: ['data-screen-mode'] });
        measure();
        return () => { observer.disconnect(); mode.disconnect(); };
    }, [ref]);
    return size;
}
