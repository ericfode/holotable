const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript5');

// the words a tapped card's move buttons and the Undo strip show (src/play/protocol.ts)
function load(rel) {
    const filename = path.join(__dirname, '..', rel);
    const mod = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        fileName: filename,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    new Function('require', 'module', 'exports', code)(() => ({}), mod, mod.exports);
    return mod.exports;
}
const { moveVerb, moveText, moveIcon, actionCardId, noEffectText, isDud } = load('src/play/protocol.ts');

const card = (i, n, zone, id = `c${i}`) => ({ i, kind: 'card', label: n.toLowerCase(), card: { id, n, s: null, zone, ctl: 'p1' } });
const decide = (prompt, actions) => ({
    t: 'decide', seq: 3, you: 'p1', ms: null, state: {}, revealed: [], actions,
    prompt: { type: null, signature: '', title: null, promptTitle: null, selectCardMode: null, selected: [], actionWindow: false, ...prompt }
});

test('in the action window a hand card is played, a unit attacks or is used, a leader or base is used', () => {
    const m = decide({ actionWindow: true }, []);
    assert.equal(moveVerb(card(2, 'Neel', 'hand'), m), 'Play');
    assert.equal(moveVerb(card(3, 'Outer Rim Constable', 'groundArena'), m), 'Attack or use');
    assert.equal(moveVerb(card(4, 'X-Wing', 'spaceArena'), m), 'Attack or use');
    assert.equal(moveVerb(card(5, 'Ahsoka Tano', 'base'), m), 'Use');
    assert.equal(moveVerb(card(6, 'Smuggled', 'resource'), m), 'Play');
    assert.equal(moveText(card(2, 'Neel', 'hand'), m), 'Play Neel');
});

test('a prompt that picks several cards selects and unselects; any other card prompt chooses', () => {
    const many = decide({ selectCardMode: 'multiple', selected: ['c1'] }, []);
    assert.equal(moveVerb(card(1, 'Neel', 'hand'), many), 'Unselect');
    assert.equal(moveVerb(card(2, 'BD-1', 'hand'), many), 'Select');
    assert.equal(moveText(card(2, 'BD-1', 'hand'), many), 'Select BD-1');
    const one = decide({ selectCardMode: 'single', title: 'Choose a target for attack' }, []);
    assert.equal(moveVerb(card(1, 'Data Vault', 'base'), one), 'Choose');
});

test('a display pick takes its name from the prompt cards; a hidden card stays hidden', () => {
    const shown = { id: 'c9', n: 'Battlefield Marine', s: null, zone: 'deck', ctl: 'p1', st: 'selectable' };
    const m = decide({ cards: [shown] }, []);
    assert.equal(moveText({ i: 0, kind: 'displayCard', label: 'menuButton', arg: 'c9' }, m), 'Choose Battlefield Marine');
    assert.equal(moveText(card(1, 'x', 'hand', 'hidden'), decide({}, [])), 'Choose a hidden card');
});

test('buttons, per-card buttons, options and splits read as their own words', () => {
    const m = decide({ actionWindow: true }, []);
    assert.equal(moveText({ i: 0, kind: 'button', label: 'Pass' }, m), 'Pass');
    assert.equal(moveText({ i: 1, kind: 'option', label: '#3' }, m), '3');
    assert.equal(moveText({ i: 2, kind: 'perCardButton', label: 'Discard:c4', cardUuid: 'c4' }, m), 'Discard: c4');
    assert.equal(moveVerb({ i: 2, kind: 'perCardButton', label: 'Discard:c4', cardUuid: 'c4' }, m), 'Discard');
    const split = { i: 3, kind: 'distribute', label: 'distribute 3', distribute: { type: 'damage', amount: 3, tokenType: null, targets: [] } };
    assert.equal(moveText(split, m), 'Split 3 damage');
});

test("a card's move icon on a touch screen: one per kind of move, and the card it belongs to", () => {
    const m = decide({ actionWindow: true }, []);
    assert.equal(moveIcon(card(2, 'Neel', 'hand'), m), 'play');
    assert.equal(moveIcon(card(3, 'Outer Rim Constable', 'groundArena'), m), 'attack');
    assert.equal(moveIcon(card(4, 'X-Wing', 'spaceArena'), m), 'attack');
    assert.equal(moveIcon(card(5, 'Ahsoka Tano', 'base'), m), 'use');
    const many = decide({ selectCardMode: 'multiple', selected: ['c1'] }, []);
    assert.equal(moveIcon(card(1, 'Neel', 'hand'), many), 'unselect');
    assert.equal(moveIcon(card(2, 'BD-1', 'hand'), many), 'select');
    const target = decide({ selectCardMode: 'single', title: 'Choose a target for attack' }, []);
    assert.equal(moveIcon(card(1, 'Data Vault', 'base'), target), 'choose');
    assert.equal(moveIcon({ i: 0, kind: 'displayCard', label: 'menuButton', arg: 'c9' }, target), 'choose');
    // the card whose icon counts down while a move waits to go
    assert.equal(actionCardId(card(2, 'Neel', 'hand')), 'c2');
    assert.equal(actionCardId({ i: 0, kind: 'displayCard', label: 'menuButton', arg: 'c9' }), 'c9');
    assert.equal(actionCardId({ i: 1, kind: 'button', label: 'Pass' }), undefined);
});

test('a move that would change nothing: flagged by the table, or named so by the engine', () => {
    assert.deepEqual(noEffectText('(No effect) Attack'), { text: 'Attack', dud: true });
    assert.deepEqual(noEffectText('Attack'), { text: 'Attack', dud: false });
    assert.equal(isDud({ i: 0, kind: 'button', label: '(No effect) Use ability' }), true);
    assert.equal(isDud({ ...card(2, 'Vanquish', 'hand'), noEffect: true }), true);
    assert.equal(isDud(card(2, 'Vanquish', 'hand')), false);
});
