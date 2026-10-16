import type { AbilityKind } from './abilities';
import { clamp, phase } from './animationTimeline';

export type SemanticMotion = 'strike' | 'protect' | 'restore' | 'uplift';
// A small vocabulary, not a rules taxonomy: routes/poses/removal keep their established primitives.
const roles: Partial<Record<AbilityKind, string>> = {
    damage: 'impact', shield: 'protection', heal: 'restoration', buff: 'enhancement', debuff: 'diminishment',
    defeat: 'removal', ready: 'readiness', exhaust: 'readiness', resource: 'resource',
    draw: 'movement', discard: 'movement', mill: 'movement', return: 'movement', recover: 'movement', play: 'movement', control: 'control'
};
export const sharedEffectRole = (kind: AbilityKind) => roles[kind];
/** Presentation only: called after the shared planner has checked an actual outcome. */
export function sharedSemanticMotion(kind: AbilityKind): SemanticMotion | undefined {
    switch (kind) {
        case 'damage': return 'strike';
        case 'shield': return 'protect';
        case 'heal': return 'restore';
        case 'buff': return 'uplift';
        default: return undefined;
    }
}
/** A strike commits late and accelerates into impact; supports never use this trajectory. */
export function strikeProgress(progress: number) {
    const t = phase(progress, .16, .4);
    return { head: t * t, tail: Math.max(0, t - .16) ** 2, visible: t > 0 && t < 1 };
}
/** Gathering follows a curved, slowing path from the recipient's periphery inward. */
export function gatherPoint(t: number, side: number, width: number, height: number) {
    const u = 1 - (1 - clamp(t)) ** 3;
    return { x: side * width * .68 * (1 - u) ** 2 + 2 * (1 - u) * u * side * width * .48,
        y: (1 - u) ** 2 * height * .35 + 2 * (1 - u) * u * -height * .55 - u * u * height * .08 };
}
