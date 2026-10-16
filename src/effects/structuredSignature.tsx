import { AbilityGlyph, AttachmentMask, CardGhost, ScreenPixels, colorOf, type EffectBox, type PlacedOutcome } from './primitives';
import { easeInOut, phase } from './animationTimeline';
import { SemanticVocabulary } from './semanticVocabulary';
import { sharedEffectRole, sharedSemanticMotion } from './semanticMotion';

/** Actual entry/control endpoints use the existing measured ending layout and pixel-sized card faces. */
function SharedEntry({ placed, p }: { placed: PlacedOutcome; p: number }) {
    const t = easeInOut(phase(p, .2, .72)), from = placed.from, to = placed.to, body = placed.outcome.unit;
    const at = { ...to, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    const final = to.cardSize ?? { w: 72, h: 101 }, initial = from.cardSize ?? { w: 48, h: 68 };
    const face = { w: initial.w + (final.w - initial.w) * t, h: initial.h + (final.h - initial.h) * t };
    return <g data-semantic-role={sharedEffectRole(placed.outcome.kind)} data-semantic-motion={placed.outcome.kind === 'control' ? 'control-transfer' : 'intact-entry'}>
        {from.exact && <AttachmentMask at={from} p={p} start={.2} />}
        <ScreenPixels at={at} opacity={phase(p, .18, .24)} color={colorOf(placed.outcome.kind)}>
            <g transform={`rotate(${body?.x ? 10 * t : 0})`}><CardGhost card={body ?? placed.outcome.card} box={face} />
                {placed.outcome.kind === 'control' && body && <g data-semantic-control-facts="true">
                    {[body.p, Math.max(0, body.h - body.d)].map((value, i) => <g key={i} transform={`translate(${(i ? 1 : -1) * (face.w / 2 - 10)} ${face.h / 2 - 13})`}>
                        <rect x="-10" y="-10" width="20" height="20" rx="3" fill={i ? '#174772' : '#8b2936'} stroke="none" />
                        <text data-semantic-control-stat={i ? 'hp' : 'power'} y="4" textAnchor="middle" fill="#fff" stroke="none" style={{ font: '800 13px sans-serif' }}>{value}</text>
                        {i === 1 && body.d > 0 && <g transform="translate(3 -15)"><circle r="8" fill="#d95834" stroke="none" /><text data-semantic-control-stat="wounds" y="3" textAnchor="middle" fill="#fff" stroke="none" style={{ font: '800 10px sans-serif' }}>{body.d}</text></g>}
                    </g>)}
                </g>}
            </g>
        </ScreenPixels>
    </g>;
}

/** All supported outcomes compose on the same reversible clock; no static branch or order executes here. */
export function StructuredSignature({ geometry, p, sourceKnown }: { geometry: { source: EffectBox; outcomes: PlacedOutcome[]; zones?: Record<string, EffectBox>; cards?: Record<string, EffectBox> }; p: number; sourceKnown: boolean }) {
    return <g data-structured-recipes="true">
        {geometry.outcomes.filter(({ outcome }) => sharedSemanticMotion(outcome.kind)).map(placed =>
            <SemanticVocabulary key={placed.key} source={geometry.source} placed={placed} p={p} sourceKnown={sourceKnown} zones={geometry.zones} cards={geometry.cards} />)}
        {geometry.outcomes.filter(({ outcome }) => ['play', 'control'].includes(outcome.kind)).map(placed => <SharedEntry key={placed.key} placed={placed} p={p} />)}
        {geometry.outcomes.filter(({ outcome }) => outcome.sourceDisposal).map(placed => <g key={placed.key}>
            {placed.from.exact && <AttachmentMask at={placed.from} p={p} start={.24} />}
            <ScreenPixels at={placed.to} opacity={phase(p, .35, .5)} color={colorOf('discard')}><AbilityGlyph kind="discard" size={18} /></ScreenPixels>
        </g>)}
    </g>;
}
