import { useId } from 'react';
import { ScreenPixels, colorOf, mix, type EffectBox, type PlacedOutcome } from './primitives';
import { easeInOut, envelope, phase } from './animationTimeline';
import { gatherPoint, sharedEffectRole, sharedSemanticMotion, strikeProgress } from './semanticMotion';

function Strike({ from, to, p, directed }: { from: EffectBox; to: EffectBox; p: number; directed: boolean }) {
    const motion = strikeProgress(p), head = { ...to, ...mix(from, to, motion.head) }, tail = mix(from, to, motion.tail);
    const angle = Math.atan2((to.y - from.y) * (to.sy ?? 1), (to.x - from.x) * (to.sx ?? 1)) * 180 / Math.PI;
    const hit = phase(p, .39, .6), flash = envelope(p, .385, .43, .64);
    return <>
        {directed && motion.visible && <g data-semantic-projectile="strike">
            <path d={`M${tail.x} ${tail.y} L${head.x} ${head.y}`} strokeWidth="3" strokeDasharray="16 8" opacity=".65" />
            <ScreenPixels at={head}><g transform={`rotate(${angle})`}><path d="M13 0 L-16 -6 L-9 0 L-16 6 Z" fill="currentColor" stroke="none" /><path d="M6 0 L-6 -2 V2 Z" fill="#fff2de" stroke="none" /></g></ScreenPixels>
        </g>}
        <ScreenPixels at={to} opacity={flash}>
            <g data-semantic-arrival="angular-impact" transform={`rotate(${directed ? angle : -35})`}>
                <path d={`M${-27 - hit * 13} -17 L${-8 - hit * 4} -4 L${14 + hit * 14} 12 M${-19 - hit * 8} 20 L-2 3 L${22 + hit * 17} -19`} strokeWidth="3" />
                {[-1, 1].map(side => <path key={side} d={`M${side * (13 + hit * 14)} -28 l${side * (8 + hit * 7)} -10 M${side * (18 + hit * 16)} 27 l${side * (5 + hit * 5)} 9`} strokeWidth="2" />)}
            </g>
        </ScreenPixels>
        <ScreenPixels at={to} opacity={phase(p, .43, .58) * .65}><path d="M-24 -15 L-12 -5 L-18 8 M24 14 L12 5 L18 -8" strokeWidth="2" /></ScreenPixels>
    </>;
}
function Protection({ at, p, w, h }: { at: EffectBox; p: number; w: number; h: number }) {
    const close = easeInOut(phase(p, .17, .61)), scale = 1.27 - .27 * close;
    const x = w / 2 + 9, y = h / 2 + 8;
    return <ScreenPixels at={at} opacity={phase(p, .14, .25)}>
        <g data-semantic-arrival="enclosing-shell" transform={`scale(${scale})`}>
            <path d={`M0 ${-y} L${-x} ${-y * .68} V${y * .5} Q${-x * .9} ${y * .85} 0 ${y} M0 ${-y} L${x} ${-y * .68} V${y * .5} Q${x * .9} ${y * .85} 0 ${y}`} pathLength="1" strokeDasharray="1" strokeDashoffset={1 - close} strokeWidth="2.5" />
            <path d={`M0 ${-y} L${x} ${-y * .68} V${y * .5} Q${x * .9} ${y * .85} 0 ${y} Q${-x * .9} ${y * .85} ${-x} ${y * .5} V${-y * .68} Z`} fill="currentColor" fillOpacity={close * .035} stroke="none" />
        </g>
        {[-1, 1].map(side => <path key={side} d={`M${side * x} ${-y * .35} Q${side * (x + 14 * (1 - close))} 0 ${side * x} ${y * .35}`} opacity={envelope(p, .18, .35, .7)} strokeWidth="2" />)}
    </ScreenPixels>;
}
function Restoration({ at, p, w, h }: { at: EffectBox; p: number; w: number; h: number }) {
    const flow = phase(p, .18, .65), mend = easeInOut(phase(p, .36, .64));
    return <ScreenPixels at={at}>
        <g data-semantic-arrival="gathering-mend" opacity={envelope(p, .14, .32, .8)}>
            {[-1, 1].map(side => <path key={side} d={`M${side * w * .68} ${h * .35} Q${side * w * .48} ${-h * .55} 0 ${-h * .08}`} strokeDasharray="13 17" strokeDashoffset={-flow * 90} strokeWidth="2" />)}
            {[0, 1, 2, 3].map(i => {
                const t = phase(p, .16 + i * .045, .6 + i * .035), point = gatherPoint(t, i % 2 ? 1 : -1, w, h);
                return <g key={i} transform={`translate(${point.x} ${point.y})`} opacity={Math.sin(t * Math.PI)}><path d="M-4 0 H4 M0 -4 V4" strokeWidth="1.5" /></g>;
            })}
        </g>
        {[-1, 0, 1].map(i => <path key={i} d={`M${-w * .38 * mend} ${i * h * .16} Q0 ${i * h * .16 + 4} ${w * .38 * mend} ${i * h * .16}`} strokeWidth="1.5" opacity={envelope(p, .3, .52, .9) * .65} />)}
    </ScreenPixels>;
}
function Uplift({ at, p, w, h }: { at: EffectBox; p: number; w: number; h: number }) {
    const rise = easeInOut(phase(p, .18, .61));
    return <ScreenPixels at={at} opacity={phase(p, .16, .3)}>
        <g data-semantic-arrival="ascending-steps">
            {[-1, 1].map(side => <g key={side} transform={`translate(${side * (w / 2 + 8)} ${h * (.18 - rise * .35)})`}>
                {[0, 1, 2].map(i => <g key={i} opacity={phase(p, .18 + i * .07, .33 + i * .07) * (1 - i * .14)} transform={`translate(0 ${i * 12})`}><path d="M-5 3 L0 -2 L5 3" strokeWidth="2" /></g>)}
            </g>)}
            <path d={`M${-w * .3} ${h * .35} H${w * .3}`} strokeWidth="3" opacity={phase(p, .4, .6) * .55} />
        </g>
    </ScreenPixels>;
}

/** Semantic motion replaces shared generic effects; it never creates or resolves an outcome. */
export function SemanticVocabulary({ source, placed, p, sourceKnown, zones = {}, cards = {} }: { source: EffectBox; placed: PlacedOutcome; p: number; sourceKnown: boolean; zones?: Record<string, EffectBox>; cards?: Record<string, EffectBox> }) {
    const id = `semantic-clearance-${useId().replace(/:/g, '')}`, { outcome, box } = placed, motion = sharedSemanticMotion(outcome.kind);
    if (!motion) return null;
    const w = box.w * (box.sx ?? 1), h = box.h * (box.sy ?? 1);
    const counters = [...Object.values(zones).filter(zone => !!zone.stat).map(zone => ({ ...zone, ...zone.stat! })),
        ...[box, ...Object.values(cards)].flatMap(card => Object.values(card.counters ?? {}).map(counter => ({ ...card, ...counter })))];
    return <g data-semantic-role={sharedEffectRole(outcome.kind)} data-semantic-motion={motion} data-semantic-target={outcome.card?.id} style={{ color: colorOf(outcome.kind) }}>
        <defs><mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="600"><rect width="1000" height="600" fill="white" stroke="none" />{counters.map((counter, i) => <rect key={i} x={counter.x - counter.w / 2 - 2} y={counter.y - counter.h / 2 - 2} width={counter.w + 4} height={counter.h + 4} fill="black" stroke="none" />)}</mask></defs>
        <g mask={`url(#${id})`}>
            {motion === 'strike' ? <Strike from={source} to={box} p={p} directed={sourceKnown && !outcome.sourceCard} /> : <>
                {sourceKnown && !outcome.sourceCard && <ScreenPixels at={source} opacity={envelope(p, .08, .17, .31) * .5}><path d="M-12 -7 H-17 V7 H-12 M12 -7 H17 V7 H12" strokeWidth="1.5" /></ScreenPixels>}
                {motion === 'protect' ? <Protection at={box} p={p} w={w} h={h} /> : motion === 'restore' ? <Restoration at={box} p={p} w={w} h={h} /> : <Uplift at={box} p={p} w={w} h={h} />}
            </>}
        </g>
    </g>;
}
