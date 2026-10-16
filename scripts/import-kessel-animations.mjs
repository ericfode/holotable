#!/usr/bin/env node
/** Build a presentation index, never a rules engine or runtime admission list. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const EFFECT_RECIPES = { damage: 'damage', heal: 'heal', defeat: 'defeat', returnToHand: 'return', ready: 'ready', exhaust: 'exhaust', resourceCard: 'resource' };
export function classifyAnimation(card) {
    if (!card.card?.types?.includes('event')) return { reason: 'non-event' };
    if (card.status !== 'supported') return { reason: 'compiler-unsupported' };
    const abilities = card.abilities?.card;
    if (!Array.isArray(abilities) || abilities.length !== 1) return { reason: 'multiple-or-missing-abilities' };
    const a = abilities[0], effect = a.effect;
    if (a.trigger !== 'event' || a.optional || a.condition || a.ifYouDo || a.then || a.ifYouDoNot || a.costs?.length
        || Object.keys(a).some(k => !['trigger', 'title', 'costs', 'effect', 'targetResolver'].includes(k))) return { reason: 'compound-ability' };
    const recipe = EFFECT_RECIPES[effect?.kind];
    if (!recipe) return { reason: `effect:${effect?.kind ?? 'missing'}` };
    if (Object.keys(effect).some(k => !['kind', 'target', 'amount'].includes(k))
        || !['chosen', 'self'].includes(effect.target)) return { reason: 'compound-effect' };
    if (['damage', 'heal'].includes(recipe) && (effect.amount?.kind !== 'const' || !Number.isFinite(effect.amount.value)
        || effect.amount.value <= 0)) return { reason: 'dynamic-amount' };
    return { recipe };
}
export function animationIndex(catalog, bytes, revision) {
    if (catalog.schema !== 'swu-card-ir/v1' || !Array.isArray(catalog.cards)) throw new Error('Expected swu-card-ir/v1 cards');
    const excluded = {}, families = {}, cards = [];
    for (const card of catalog.cards) {
        const result = classifyAnimation(card);
        if (!result.recipe) { excluded[result.reason] = (excluded[result.reason] ?? 0) + 1; continue; }
        families[result.recipe] = (families[result.recipe] ?? 0) + 1;
        cards.push({ id: card.internalName, name: card.card.title, prints: card.card.setCodes.map(p => `${p.set}_${String(p.number).padStart(3, '0')}`),
            recipe: result.recipe, ability: card.abilities.card[0], sourceHash: card.sourceHash, dataHash: card.dataHash });
    }
    return { schema: 'holotable-animation-index/v1', source: { schema: catalog.schema, revision,
        sha256: createHash('sha256').update(bytes).digest('hex'), compilerHash: catalog.compilerHash, sourceTreeHash: catalog.sourceTreeHash },
        coverage: { totalDefinitions: catalog.cards.length, mappedDefinitions: cards.length, families, excluded }, cards };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [input, revision, output = 'src/effects/generated/kesselAnimations.json'] = process.argv.slice(2).filter(arg => arg !== '--check');
    if (!input || !/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Usage: node scripts/import-kessel-animations.mjs CATALOG_JSON SOURCE_COMMIT [OUTPUT]');
    const bytes = fs.readFileSync(input), index = animationIndex(JSON.parse(bytes), bytes, revision);
    fs.mkdirSync(new URL('../src/effects/generated/', import.meta.url), { recursive: true });
    const generated = JSON.stringify(index, null, 2) + '\n';
    if (process.argv.includes('--check')) {
        if (fs.readFileSync(output, 'utf8') !== generated) throw new Error('Animation index is stale; regenerate from the pinned catalog.');
    } else fs.writeFileSync(output, generated);
    console.log(JSON.stringify(index.coverage));
}
