const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript5');
const filename = path.join(__dirname, '../src/lib/tableLayout.ts');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText)(mod, mod.exports);
const { boardSeats, tableCardSize } = mod.exports;

test('viewer perspective keeps either own seat at the bottom with a stable spectator default', () => {
    assert.deepEqual(boardSeats(), ['p2', 'p1']);
    assert.deepEqual(boardSeats('p1'), ['p2', 'p1']);
    assert.deepEqual(boardSeats('p2'), ['p1', 'p2']);
});

test('ordinary embeds scale from their own width without a viewport-height budget', () => {
    assert.deepEqual(tableCardSize(335), { unit: 90, hand: 72 });
    assert.deepEqual(tableCardSize(1170), { unit: 130, hand: 73 });
    assert.deepEqual(tableCardSize(2400), { unit: 150, hand: 90 });
    assert.ok(tableCardSize(700).unit < tableCardSize(1600).unit);
});

test('bounded fields fit card faces and keep hand size independent to avoid resize feedback', () => {
    const bounded = tableCardSize(1170, 150);
    assert.deepEqual(bounded, { unit: 84, hand: 73 });
    assert.ok(bounded.unit * 1.4 + 32 <= 150);
    assert.equal(bounded.hand, tableCardSize(1170).hand);
    assert.equal(tableCardSize(1170, 300).unit, tableCardSize(1170).unit);
});
