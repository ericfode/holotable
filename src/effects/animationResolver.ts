import type { CardRef } from '../data/types';
import { CARD_EFFECTS, findCardEffect } from './catalogue';
import { planStructuredCue, structuredCard, structuredDefinition } from './structured';
import type { CardEffectCue, CardEffectDefinition } from './types';

/** Bespoke presentation is opt-in by exact print. Registry entries never change game outcomes. */
export interface CardAnimationOverride {
    signatureId: string;
    prints: readonly string[];
    reason: string;
}
export function defineAnimationOverrides(entries: readonly CardAnimationOverride[]) {
    const byPrint = new Map<string, CardAnimationOverride>();
    for (const entry of entries) {
        if (!entry.reason.trim() || !CARD_EFFECTS.some(card => card.id === entry.signatureId)) throw new Error('An animation override needs an existing signature and a reason');
        for (const print of entry.prints) {
            if (structuredCard({ n: '', s: print })?.id !== entry.signatureId) throw new Error(`Override print does not identify its signature: ${print}`);
            if (byPrint.has(print)) throw new Error(`Duplicate animation override: ${print}`);
            byPrint.set(print, entry);
        }
    }
    return { entries, find: (card: CardRef | null) => card?.s ? byPrint.get(card.s.toUpperCase().replace(/[- ]/g, '_')) : undefined };
}

// Deliberate cinematic / boundary treatments; ordinary legacy registrations are examples, not overrides.
export const CARD_ANIMATION_OVERRIDES = defineAnimationOverrides([
    { signatureId: 'superlaser-blast', prints: ['SOR_043'], reason: 'Table-wide weapon sweep with the established six-target defeat composition.' },
    { signatureId: 'force-lightning', prints: ['SOR_138'], reason: 'Distinct suppression, chosen resource channel and lightning treatment.' },
    { signatureId: 'sneak-attack', prints: ['SOR_219'], reason: 'Discounted ready entry and separately selected regroup defeat boundary.' },
    { signatureId: 'change-of-heart', prints: ['SOR_224'], reason: 'Temporary control exchange and separately witnessed return boundary.' },
    { signatureId: 'final-showdown', prints: ['SHD_208'], reason: 'Pending player loss and explicit regroup result, with the ordinary table preserved.' }
]);
export type AnimationRenderer = 'default' | 'shared' | 'legacy';
export function resolveCardAnimation(card: CardRef, overrides = CARD_ANIMATION_OVERRIDES): { definition: CardEffectDefinition; renderer: 'shared' | 'override'; override?: CardAnimationOverride } {
    const override = overrides.find(card);
    if (override) return { definition: CARD_EFFECTS.find(c => c.id === override.signatureId)!, renderer: 'override', override };
    // Legacy catalogue metadata may supply a staged title/timing, but never grants bespoke precedence.
    const definition = structuredDefinition(card) ?? findCardEffect(card) ?? {
        id: 'unknown-card', description: 'Observed card outcomes; JSON definition unavailable.', name: card.n, setCode: card.s ?? '', family: 'support', color: '#91d9e6', visual: 'structured', durationMs: 2400
    };
    return { definition, renderer: 'shared' };
}
export function routeAnimationCue(cue: CardEffectCue, renderer: AnimationRenderer = 'default', overrides = CARD_ANIMATION_OVERRIDES): CardEffectCue {
    if (renderer === 'legacy') return { ...cue, structured: undefined };
    const resolved = cue.source ? resolveCardAnimation(cue.source, overrides) : null;
    if (renderer === 'default' && resolved?.renderer === 'override') return { ...cue, definition: resolved.definition, structured: undefined, animationOverride: resolved.override?.signatureId };
    return planStructuredCue({ ...cue, definition: { ...cue.definition, id: cue.definition.id.startsWith('structured:') ? cue.definition.id : `structured:${cue.definition.id}` }, animationOverride: undefined });
}
