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
/** Recipe programs contain presentation operations only. Targets, amounts and branch decisions stay unresolved. */
export const SHARED_EFFECT_RECIPES = {
    ...EFFECT_RECIPES, resourceCardSystem: 'resource', modifyStats: ['buff', 'debuff'],
    giveShield: 'shield', giveExperience: 'buff', draw: 'draw', discardDeckSystem: 'mill',
    discardHandSystem: 'discard', discardSpecificCard: 'discard', returnToHandSystem: 'return',
    moveDeckCards: 'recover', playCardSystem: 'play', takeControl: 'control'
};
const group = (kind, children) => children.length ? { kind, children } : { kind: 'unsupported', effectKind: `empty:${kind}` };
const unknownFields = (value, known, prefix) => Object.keys(value).filter(key => !known.includes(key)).map(key => ({ kind: 'unsupported', effectKind: `${prefix}.${key}` }));
export function compileEffectProgram(effect) {
    if (!effect || typeof effect !== 'object') return { kind: 'unsupported', effectKind: 'missing' };
    const mapped = SHARED_EFFECT_RECIPES[effect.kind];
    if (mapped) {
        const fields = {
            damage: 'target amount damageType isCost', heal: 'target amount', defeat: 'target isCost', ready: 'target isCost', exhaust: 'target isCost',
            returnToHand: 'target destination isCost', returnToHandSystem: 'target destination', resourceCard: 'target',
            resourceCardSystem: 'target targetPlayer resourceControllingPlayer readyResource readyTiming readinessTargets readinessPropertyContract controllerEvaluation',
            modifyStats: 'target power hp duration', giveShield: 'target amount', giveExperience: 'target amount', draw: 'target amount',
            discardSpecificCard: 'target isCost', takeControl: 'target duration',
            discardHandSystem: 'target amount amountClamp assertAmountNonNegative autoSingleTarget availabilityFilter cardCondition cardTypeFilter events generationFilter mustFullyResolveRequiresFullAmount overallEventCondition random randomSource wrapperChoosingPlayer zeroAmount actualChooser',
            discardDeckSystem: 'target amount amountClamp assertAmountNonNegative events mustFullyResolveRequiresFullAmount overallEventCondition selection zeroAmount',
            moveDeckCards: 'target destination destinationPlayer event eventTargetOrder leavesPlay nativeSystem propertySource shuffle shuffleMovedCards targetProcessing',
            playCardSystem: 'target adjustCost attachContext attachTargetCondition canPlayFromAnyZone enterPlayEffect entersReady exploitValue helper ignoredRequirements nested optional playAsType playType'
        };
        const allowed = new Set(['kind', ...(fields[effect.kind] ?? '').split(' ')]);
        const leaf = { kind: 'effect', effectKind: effect.kind, recipes: [].concat(mapped), evidence: 'recorded-outcome' };
        const children = [leaf, ...Object.keys(effect).filter(key => !allowed.has(key)).map(key => ({ kind: 'unsupported', effectKind: `effect-field:${effect.kind}.${key}` }))];
        if (effect.enterPlayEffect) children.push(compileEffectProgram(effect.enterPlayEffect));
        return children.length === 1 ? leaf : group('effect-with-context', children);
    }
    const compile = compileEffectProgram;
    const fields = {
        simultaneous: ['kind', 'effects'], sequence: ['kind', 'effects'], conditional: ['kind', 'condition', 'evaluation', 'onTrue', 'onFalse'],
        select: ['kind', 'targetResolver', 'effect'], chooseModalEffects: ['kind', 'target', 'amountOfChoices', 'canChooseSameOptionMoreThanOnce', 'choices', 'activePromptTitleParts'],
        resolveChoice: ['kind', 'choices', 'resultBinding'], namedSelectCardSystem: ['kind', 'name', 'resolver', 'properties', 'innerSystem', 'innerSystemDefaultTarget', 'contextTargetAssignment', 'contract', 'legality', 'defaults', 'emptySelection', 'cancelIfNoTargetsDefault'],
        systemPropertiesFactory: ['kind', 'parameters', 'captures', 'constructionOrder', 'captureIdentity', 'invocationPolicy', 'effect']
    };
    const extra = fields[effect.kind] ? unknownFields(effect, fields[effect.kind], `effect-field:${effect.kind}`) : [];
    if (extra.length) {
        const clean = Object.fromEntries(Object.entries(effect).filter(([key]) => fields[effect.kind].includes(key)));
        return group('effect-with-context', [compile(clean), ...extra]);
    }
    const choice = value => group('choice-entry', [compile(value.effect), ...unknownFields(value, ['label', 'effect'], 'choice-field')]);
    switch (effect.kind) {
        case 'simultaneous': return Array.isArray(effect.effects) ? group('parallel', effect.effects.map(compile)) : { kind: 'unsupported', effectKind: 'dynamic-parallel' };
        case 'sequence': return Array.isArray(effect.effects) ? group('sequence', effect.effects.map(compile)) : { kind: 'unsupported', effectKind: 'dynamic-sequence' };
        case 'conditional': return group('conditional', [compile(effect.onTrue), ...(effect.onFalse ? [compile(effect.onFalse)] : [])]);
        case 'select': return group('selection', [compile(effect.effect)]);
        case 'chooseModalEffects': return Array.isArray(effect.choices) ? group('choice', effect.choices.map(choice)) : { kind: 'unsupported', effectKind: 'dynamic-modal-choices' };
        case 'resolveChoice': return Array.isArray(effect.choices) || Array.isArray(effect.choices?.entries) ? group('choice', [...(Array.isArray(effect.choices) ? effect.choices : effect.choices.entries).map(choice), ...(!Array.isArray(effect.choices) ? unknownFields(effect.choices, ['entries'], 'choice-container-field') : [])]) : { kind: 'unsupported', effectKind: 'dynamic-choice' };
        case 'namedSelectCardSystem': return group('selection', [compile(effect.innerSystem)]);
        case 'systemPropertiesFactory': return group('runtime-properties', [compile(effect.effect)]);
        // Delayed/granted effects are intentionally not flattened into immediate resolution.
        default: return { kind: 'unsupported', effectKind: effect.kind ?? 'missing' };
    }
}
function compileAbility(ability) {
    const known = new Set('trigger title costs effect targetResolver targetResolvers optional condition then ifYouDo ifYouDoNot hooks contextTitle limit targetController kind contract attackerMustSurvive coordinate cannotTargetFirst collectiveTrigger modificationType triggerContract bounty nullifiedEventCountsAsResolved titleParts shouldCardHaveDamageModification amount namedTargetTiming targetZoneFilter ifYouDoCondition thenCondition attachedContext zoneFilter playerChoosingOptional targetCardTypeFilter canBeTriggeredBy onlyFromPlayer damageOfType gainedHost sourceZoneFilter classSetupSide appendOverrideTitle applyAtAbilityInitiation displayMessageProgram customConfirmation optionalButtonTextOverride optionalPassProtocol'.split(' '));
    const children = [compileEffectProgram(ability.effect), ...Object.keys(ability).filter(key => !known.has(key)).map(key => ({ kind: 'unsupported', effectKind: `ability-field:${key}` }))];
    for (const key of ['then', 'ifYouDo', 'ifYouDoNot']) if (ability[key]) {
        const continuation = ability[key].kind === 'scopedAbilityCallback' ? ability[key].body : ability[key];
        children.push(group(key, [compileAbility(continuation), ...(ability[key].kind === 'scopedAbilityCallback' ? unknownFields(ability[key], ['kind', 'body', 'parameters', 'captures', 'binding'], 'callback-field') : [])]));
    }
    return group(ability.optional ? 'optional' : ability.condition ? 'conditional-ability' : 'ability', children);
}
export function summarizeProgram(program) {
    const recipes = new Set(), unsupported = new Set(), constructs = new Set();
    function visit(node) {
        constructs.add(node.kind);
        for (const recipe of node.recipes ?? []) recipes.add(recipe);
        if (node.kind === 'unsupported') unsupported.add(node.effectKind);
        for (const child of node.children ?? []) visit(child);
    }
    visit(program);
    return { recipes: [...recipes].sort(), unsupported: [...unsupported].sort(), constructs: [...constructs].sort() };
}
export function animationIndex(catalog, bytes, revision) {
    if (catalog.schema !== 'swu-card-ir/v1' || !Array.isArray(catalog.cards)) throw new Error('Expected swu-card-ir/v1 cards');
    const families = {}, cards = [], unsupportedEffects = {};
    for (const card of catalog.cards) {
        const programs = Object.entries(card.abilities ?? {}).flatMap(([channel, abilities]) => abilities.map(ability => ({ channel, trigger: ability.trigger, program: compileAbility(ability) })));
        if (card.card.types.some(type => ['unit', 'leader'].includes(type))) programs.push({ channel: 'intrinsic', trigger: 'entry', program: { kind: 'effect', effectKind: 'physical-card-entry', recipes: ['play'], evidence: 'recorded-outcome' } });
        if (card.status !== 'supported') programs.push({ channel: 'compiler', trigger: 'unknown', program: { kind: 'unsupported', effectKind: `compiler:${card.status}` } });
        const summary = summarizeProgram(group('card', programs.map(p => p.program)));
        const direct = classifyAnimation(card);
        for (const recipe of summary.recipes) families[recipe] = (families[recipe] ?? 0) + 1;
        for (const kind of summary.unsupported) unsupportedEffects[kind] = (unsupportedEffects[kind] ?? 0) + 1;
        cards.push({ id: card.internalName, name: card.card.subtitle ? `${card.card.title}: ${card.card.subtitle}` : card.card.title,
            types: card.card.types, prints: (card.card.setCodes ?? []).map(p => `${p.set}_${String(p.number).padStart(3, '0')}`),
            recipe: direct.recipe ?? summary.recipes[0] ?? null, recipes: summary.recipes,
            ...(direct.recipe ? { ability: card.abilities.card[0] } : {}), programs,
            unsupported: summary.unsupported, compilerStatus: card.status, sourceHash: card.sourceHash, dataHash: card.dataHash });
    }
    const events = cards.filter(card => card.types.includes('event'));
    const coverage = list => ({ routed: list.length, withRecipe: list.filter(c => c.recipes.length).length,
        fullyMappedShape: list.filter(c => c.recipes.length && !c.unsupported.length).length,
        partialShape: list.filter(c => c.recipes.length && c.unsupported.length).length,
        unsupportedShape: list.filter(c => !c.recipes.length).length });
    return { schema: 'holotable-animation-index/v2', source: { schema: catalog.schema, revision,
        sha256: createHash('sha256').update(bytes).digest('hex'), compilerHash: catalog.compilerHash, sourceTreeHash: catalog.sourceTreeHash },
        coverage: { totalDefinitions: cards.length, events: coverage(events), allCards: coverage(cards), families, unsupportedEffects }, cards };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [input, revision, output = 'src/effects/generated/kesselAnimations.json'] = process.argv.slice(2).filter(arg => arg !== '--check');
    if (!input || !/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Usage: node scripts/import-kessel-animations.mjs CATALOG_JSON SOURCE_COMMIT [OUTPUT]');
    const bytes = fs.readFileSync(input), index = animationIndex(JSON.parse(bytes), bytes, revision);
    fs.mkdirSync(new URL('../src/effects/generated/', import.meta.url), { recursive: true });
    const header = JSON.stringify({ ...index, cards: undefined }, null, 2);
    const generated = header.slice(0, -2) + ',\n  \"cards\": [\n' + index.cards.map(card => '    ' + JSON.stringify(card)).join(',\n') + '\n  ]\n}\n';
    if (process.argv.includes('--check')) {
        if (fs.readFileSync(output, 'utf8') !== generated) throw new Error('Animation index is stale; regenerate from the pinned catalog.');
    } else fs.writeFileSync(output, generated);
    console.log(JSON.stringify(index.coverage));
}
