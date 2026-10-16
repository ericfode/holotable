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

test('card scale uses available width and height while preserving minimum legibility and room for controls', () => {
    assert.deepEqual(tableCardSize(335, 669), { unit: 90, hand: 72 });
    assert.deepEqual(tableCardSize(1170, 679), { unit: 121, hand: 73 });
    assert.deepEqual(tableCardSize(2400, 1600), { unit: 150, hand: 90 });
    assert.ok(tableCardSize(1600, 500).unit < tableCardSize(1600, 1000).unit);
    assert.ok(tableCardSize(700, 1000).unit < tableCardSize(1600, 1000).unit);
});
