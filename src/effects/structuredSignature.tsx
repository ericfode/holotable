import { AbilityGlyph, AttachmentMask, EnergyBeam, ScreenPixels, colorOf, type EffectBox, type PlacedOutcome } from './primitives';
import { phase } from './animationTimeline';

/** Shared anticipation → directed action; OutcomeVisual supplies impact, motion and held numeric receipts. */
export function StructuredSignature({ geometry, p, sourceKnown }: { geometry: { source: EffectBox; outcomes: PlacedOutcome[] }; p: number; sourceKnown: boolean }) {
    return <g data-structured-recipes="true">
        {sourceKnown && geometry.outcomes.filter(({ outcome }) => ['damage', 'heal', 'ready', 'exhaust'].includes(outcome.kind)).map(placed =>
            <EnergyBeam key={placed.key} from={geometry.source} to={placed.box} p={p} start={.18} end={.43} color={colorOf(placed.outcome.kind)} width={4} />)}
        {geometry.outcomes.filter(({ outcome }) => outcome.sourceDisposal).map(placed => <g key={placed.key}>
            {placed.from.exact && <AttachmentMask at={placed.from} p={p} start={.24} />}
            <ScreenPixels at={placed.to} opacity={phase(p, .35, .5)} color={colorOf('discard')}><AbilityGlyph kind="discard" size={18} /></ScreenPixels>
        </g>)}
    </g>;
}
