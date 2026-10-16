import { AbilityGlyph, AttachmentMask, CardGhost, EnergyBeam, ScreenPixels, colorOf, type EffectBox, type PlacedOutcome } from './primitives';
import { easeInOut, phase } from './animationTimeline';

/** Actual entry/control endpoints use the existing measured ending layout and pixel-sized card faces. */
function SharedEntry({ placed, p }: { placed: PlacedOutcome; p: number }) {
    const t = easeInOut(phase(p, .2, .72)), from = placed.from, to = placed.to, body = placed.outcome.unit;
    const at = { ...to, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    const final = to.cardSize ?? { w: 72, h: 101 }, initial = from.cardSize ?? { w: 48, h: 68 };
    const face = { w: initial.w + (final.w - initial.w) * t, h: initial.h + (final.h - initial.h) * t };
    return <g>
        {from.exact && <AttachmentMask at={from} p={p} start={.2} />}
        <ScreenPixels at={at} opacity={phase(p, .18, .24)} color={colorOf(placed.outcome.kind)}>
            <g transform={`rotate(${body?.x ? 10 * t : 0})`}><CardGhost card={body ?? placed.outcome.card} box={face} /></g>
        </ScreenPixels>
    </g>;
}

/** All supported outcomes compose on the same reversible clock; no static branch or order executes here. */
export function StructuredSignature({ geometry, p, sourceKnown }: { geometry: { source: EffectBox; outcomes: PlacedOutcome[] }; p: number; sourceKnown: boolean }) {
    return <g data-structured-recipes="true">
        {sourceKnown && geometry.outcomes.filter(({ outcome }) => !outcome.sourceCard && ['damage', 'heal', 'ready', 'exhaust', 'buff', 'debuff', 'shield'].includes(outcome.kind)).map(placed =>
            <EnergyBeam key={placed.key} from={geometry.source} to={placed.box} p={p} start={.18} end={.43} color={colorOf(placed.outcome.kind)} width={4} />)}
        {geometry.outcomes.filter(({ outcome }) => ['play', 'control'].includes(outcome.kind)).map(placed => <SharedEntry key={placed.key} placed={placed} p={p} />)}
        {geometry.outcomes.filter(({ outcome }) => outcome.sourceDisposal).map(placed => <g key={placed.key}>
            {placed.from.exact && <AttachmentMask at={placed.from} p={p} start={.24} />}
            <ScreenPixels at={placed.to} opacity={phase(p, .35, .5)} color={colorOf('discard')}><AbilityGlyph kind="discard" size={18} /></ScreenPixels>
        </g>)}
    </g>;
}
