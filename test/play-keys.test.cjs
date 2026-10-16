// Play mode's keys (src/play/keys.ts): which key does which legal move.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript5');

const filename = path.join(__dirname, '../src/play/keys.ts');
const mod = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
const { assignKeys, eventKey, isTyping, keyLabel, playKeys, sideOrder } = mod.exports;

const unit = (id, n = id) => ({ id, n, s: null, p: 2, h: 3, d: 0 });
const side = (seat, ground = [], space = [], hand = []) => ({
    base: { id: `${seat}-base`, n: 'Base', s: null, hp: 30, d: 0 },
    leader: { id: `${seat}-leader`, n: 'Leader', s: null, dep: 0, x: 0 },
    ground, space, hand, discard: [], deck: 30, res: { ready: 2, total: 2 }
});
const board = (p1, p2) => ({ round: 1, phase: 'action', initiative: 'p1', players: { p1, p2 } });
const drawnOf = (b) => {
    const out = new Set();
    for (const seat of ['p1', 'p2']) {
        const p = b.players[seat];
        for (const c of [p.base, p.leader, ...p.ground, ...p.space, ...(seat === 'p1' ? p.hand : [])]) out.add(c.id);
    }
    return out;
};
const cardAct = (i, id, zone = 'groundArena') => ({ i, kind: 'card', label: id, card: { id, n: id, s: null, zone, ctl: 'p1' } });
const button = (i, label) => ({ i, kind: 'button', label });
const decide = (actions, prompt = {}) => ({
    t: 'decide', seq: 1, you: 'p1', ms: null, revealed: [], state: null, actions,
    prompt: { type: null, signature: '', title: null, promptTitle: null, selectCardMode: null, selected: [], actionWindow: true, ...prompt }
});
const keyOfAct = (k, i) => k.act.get(i);

test('key caps read the layout when the browser gives it, else the US layout', () => {
    assert.equal(keyLabel('KeyQ'), 'Q');
    assert.equal(keyLabel('Digit0'), '0');
    assert.equal(keyLabel('Semicolon'), ';');
    assert.equal(keyLabel('Shift+Digit1'), '⇧1');
    assert.equal(keyLabel('Space'), 'Space');
    assert.equal(keyLabel('KeyQ', new Map([['KeyQ', 'a']])), 'A');
    assert.equal(eventKey({ code: 'Digit3', shiftKey: true }), 'Shift+Digit3');
    assert.equal(eventKey({ code: 'KeyS', shiftKey: true }), 'KeyS');
});

test('each item gets its preferred key first, then a free key of its pool, then a spare one', () => {
    const k = assignKeys([
        { id: 'a', pool: ['K1', 'K2'] },
        { id: 'b', prefer: 'K1', pool: ['K1', 'K2'] },
        { id: 'c', pool: ['K1', 'K2'] },
        { id: 'd', pool: ['K1', 'K2'] }
    ], ['S1']);
    assert.equal(k.get('b'), 'K1');
    assert.equal(k.get('a'), 'K2');
    assert.equal(k.get('c'), 'S1');
    assert.equal(k.has('d'), false);
});

test('a side lists its base, its leader, then ground and space units', () => {
    assert.deepEqual(sideOrder(side('p2', [unit('g1'), unit('g2')], [unit('s1')])), ['p2-base', 'p2-leader', 'g1', 'g2', 's1']);
});

test('action window: hand on Z X C, your side on A S D, Pass on Space, the rest on numbers', () => {
    const b = board(
        side('p1', [unit('wampa'), unit('marine')], [unit('xwing')], [unit('h1'), unit('h2'), unit('h3')]),
        side('p2', [unit('e1')])
    );
    const d = decide([cardAct(0, 'h2', 'hand'), cardAct(1, 'marine'), cardAct(2, 'p1-leader', 'base'), cardAct(3, 'xwing', 'spaceArena'), button(4, 'Pass'), button(5, 'Claim Initiative')]);
    const k = playKeys(d, b, 'p1', drawnOf(b));
    assert.equal(k.card.get('h2'), 'KeyX', 'the second card in hand');
    assert.equal(k.card.get('p1-leader'), 'KeyS', 'your leader is always S');
    assert.equal(k.card.get('marine'), 'KeyF', 'base A, leader S, then wampa D, marine F');
    assert.equal(k.card.get('xwing'), 'KeyG', 'space units after ground units');
    assert.equal(k.primary.label, 'Pass');
    assert.equal(keyOfAct(k, 5), 'Digit1');
    assert.equal(keyOfAct(k, 4), undefined, 'the main button has Space, no number');
    assert.deepEqual(k.byKey.get('KeyF'), { kind: 'card', id: 'marine' });
    assert.equal(k.byKey.get('Digit1').action.label, 'Claim Initiative');
});

test('attack targets: their base is always Q, their units follow on the top row', () => {
    const b = board(side('p1', [unit('wampa')]), side('p2', [unit('e1'), unit('e2')], [unit('tie')]));
    const d = decide([cardAct(0, 'p2-base', 'base'), cardAct(1, 'e2'), cardAct(2, 'tie', 'spaceArena')], { actionWindow: false });
    const k = playKeys(d, b, 'p1', drawnOf(b));
    assert.equal(k.card.get('p2-base'), 'KeyQ');
    assert.equal(k.card.get('e2'), 'KeyR', 'Q base, W leader, E e1, R e2');
    assert.equal(k.card.get('tie'), 'KeyT');
    assert.equal(k.primary, null);
});

test('the rows follow the board, which draws p2 on top, for a person at either seat', () => {
    const b = board(side('p1', [unit('wampa')]), side('p2', [unit('e1')], [], [unit('mine')]));
    const drawn = new Set(['p1-base', 'wampa', 'p2-base', 'e1', 'mine']);
    const d = { ...decide([cardAct(0, 'p1-base', 'base'), cardAct(1, 'e1'), cardAct(2, 'mine', 'hand')], { actionWindow: false }), you: 'p2' };
    const k = playKeys(d, b, 'p2', drawn);
    assert.equal(k.card.get('p1-base'), 'KeyA', 'p1 is drawn at the bottom');
    assert.equal(k.card.get('e1'), 'KeyE', 'p2 is drawn on top');
    assert.equal(k.card.get('mine'), 'KeyZ', 'the hand row is the person\'s own hand');
});

test('a choose-a-number menu puts each number on its own key; Cancel is found for Esc', () => {
    const b = board(side('p1'), side('p2'));
    const opts = [0, 1, 2].map((n) => ({ i: n, kind: 'option', label: `#${n}` }));
    const k = playKeys(decide([...opts, button(3, 'Cancel')], { actionWindow: false }), b, 'p1', drawnOf(b));
    assert.equal(keyOfAct(k, 0), 'Digit0');
    assert.equal(keyOfAct(k, 2), 'Digit2');
    assert.equal(keyOfAct(k, 3), 'Digit3', 'the next free number');
    assert.equal(k.cancel.label, 'Cancel');
});

test('tray cards and their own buttons take numbers in the order the bar draws them', () => {
    const b = board(side('p1'), side('p2'));
    const tray = [{ id: 't1', n: 'One', s: null, zone: 'deck', ctl: 'p1', st: 'selectable' }, { id: 't2', n: 'Two', s: null, zone: 'deck', ctl: 'p1', st: 'selectable' }];
    const d = decide([
        { i: 0, kind: 'perCardButton', label: 'Discard:One', cardUuid: 't1' },
        { i: 1, kind: 'perCardButton', label: 'Top:One', cardUuid: 't1' },
        { i: 2, kind: 'displayCard', label: 'Two', arg: 't2' },
        button(3, 'Done')
    ], { actionWindow: false, cards: tray });
    const k = playKeys(d, b, 'p1', drawnOf(b));
    assert.equal(keyOfAct(k, 0), 'Digit1');
    assert.equal(keyOfAct(k, 1), 'Digit2');
    assert.equal(k.card.get('t2'), 'Digit3');
    assert.equal(k.primary.label, 'Done');
});

test('a split gives its targets letters and leaves Space to confirm it', () => {
    const b = board(side('p1'), side('p2', [unit('e1'), unit('e2')]));
    const d = decide([{ i: 0, kind: 'distribute', label: 'Distribute', distribute: { type: 'damage', amount: 3, canDistributeLess: false, canChooseNoTargets: false, maxTargets: null, tokenType: null, targets: [{ id: 'e1', cap: 3 }, { id: 'e2', cap: 2 }, { id: 'gone', cap: null }] } }], { actionWindow: false });
    const k = playKeys(d, b, 'p1', drawnOf(b));
    assert.equal(k.split, true);
    assert.equal(k.primary, null);
    assert.equal(k.card.get('e1'), 'KeyE');
    assert.equal(k.card.get('e2'), 'KeyR');
    assert.ok(k.card.get('gone'), 'a target the board does not draw still gets a key');
});

test('a crowded side borrows free letters, and no two moves share a key', () => {
    const tokens = Array.from({ length: 12 }, (_, i) => unit(`tok${i}`));
    const b = board(side('p1', [unit('mine')]), side('p2', [], tokens));
    const d = decide(tokens.map((t, i) => cardAct(i, t.id, 'spaceArena')), { actionWindow: false });
    const k = playKeys(d, b, 'p1', drawnOf(b));
    const used = tokens.map((t) => k.card.get(t.id));
    assert.ok(used.every(Boolean));
    assert.equal(new Set(used).size, tokens.length);
    assert.equal(k.card.get('tok0'), 'KeyE', 'positions keep their top-row keys');
});

test('no decision, no keys', () => {
    const k = playKeys(null, null, 'p1', new Set());
    assert.equal(k.byKey.size, 0);
    assert.equal(k.primary, null);
});

test('hotkeys stay out of text fields, sliders and menus, not out of checkboxes', () => {
    const el = (tagName, extra = {}) => ({ tagName, isContentEditable: false, closest: () => null, ...extra });
    assert.equal(isTyping(el('INPUT', { type: 'text' })), true);
    assert.equal(isTyping(el('INPUT', { type: 'checkbox' })), false);
    assert.equal(isTyping(el('INPUT', { type: 'range' })), true, 'a slider moves with the arrow keys');
    assert.equal(isTyping(el('INPUT', { type: 'radio' })), true);
    assert.equal(isTyping(el('SELECT')), true);
    assert.equal(isTyping(el('DIV', { isContentEditable: true })), true);
    assert.equal(isTyping(el('DIV', { closest: () => ({}) })), true);
    assert.equal(isTyping(el('DIV')), false);
    assert.equal(isTyping(null), false);
});
