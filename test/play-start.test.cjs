const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript5');

// the play start screen's pure parts: which mode tabs a table's options give, the bot picker's labels, the end card's text
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
const { startModes, firstMode, botLabel, botAbout, sizeText } = load('src/play/modes.ts');
const { endText } = load('src/play/protocol.ts');

test('a table that offers no people modes keeps the bot as the only mode', () => {
    assert.deepEqual(startModes({}), ['bot']);
    assert.deepEqual(startModes({ people: [] }), ['bot']);
    assert.equal(firstMode(startModes({}), 'ABC123'), 'bot');
});

test('people modes add their tabs in a fixed order; direct adds inviting and joining', () => {
    assert.deepEqual(startModes({ people: ['join', 'lobby', 'invite'] }), ['bot', 'lobby', 'invite', 'join']);
    assert.deepEqual(startModes({ people: ['direct'] }), ['bot', 'invite', 'join']);
    assert.deepEqual(startModes({ people: ['lobby'] }), ['bot', 'lobby']);
    assert.deepEqual(startModes({ people: ['lobby', 'direct'] }, false), ['bot'], 'a table without pair() offers only the bot');
});

test('a code in the address opens on joining, when joining is offered', () => {
    assert.equal(firstMode(startModes({ people: ['lobby', 'invite', 'join'] }), 'K7Q2'), 'join');
    assert.equal(firstMode(startModes({ people: ['direct'] }), 'K7Q2'), 'join');
    assert.equal(firstMode(startModes({ people: ['lobby'] }), 'K7Q2'), 'bot');
    assert.equal(firstMode(startModes({ people: ['join'] }), null), 'bot');
});

test('a bot reads as its name, or its title with its rating and size when the table gives them', () => {
    assert.equal(botLabel('rush'), 'rush');
    assert.equal(botLabel('rush', {}), 'rush');
    assert.equal(botLabel('rush', { title: null, elo: null, bytes: null }), 'rush');
    assert.equal(botLabel('rush', { title: 'Rush' }), 'Rush');
    assert.equal(botLabel('rush', { title: 'Rush', elo: 1523.6 }), 'Rush · 1524');
    assert.equal(botLabel('jev', { elo: 1610, bytes: 2_400_000 }), 'jev · 1610 · 2.4 MB');
    assert.equal(botLabel('big', { bytes: 48_700_000 }), 'big · 49 MB');
    assert.equal(botLabel('nan', { elo: Number.NaN }), 'nan');
    assert.equal(sizeText(12_000), '< 0.1 MB');
    assert.equal(botAbout({ owner: 'eric', note: 'plays fast' }), 'by eric · plays fast');
    assert.equal(botAbout({ note: 'plays fast' }), 'plays fast');
    assert.equal(botAbout(undefined), '');
});

const end = (over) => ({ t: 'end', winner: 'p1', outcome: 'won', round: 6, steps: 210, error: null, by: null, conceded: false, replay: null, ...over });

test('the end card reads as before when the table says nothing about who conceded', () => {
    assert.deepEqual(endText(end({}), 'p1', 'rush'), { head: 'You won', detail: 'Round 6, 210 moves.' });
    assert.deepEqual(endText(end({ winner: 'p2' }), 'p1', 'rush'), { head: 'rush won', detail: 'Round 6, 210 moves.' });
    assert.deepEqual(endText(end({ winner: 'p2', outcome: 'conceded', conceded: true }), 'p1', 'rush'), { head: 'You conceded', detail: 'Round 6.' });
    assert.deepEqual(endText(end({ winner: null, outcome: 'STEP_CAP' }), 'p1', 'rush'), { head: 'No winner', detail: 'The game ran out of moves.' });
    assert.deepEqual(endText(end({ winner: null, outcome: 'ERROR', error: 'boom' }), 'p1', 'rush'), { head: 'No winner', detail: 'The game stopped: boom.' });
});

test('the other person conceding reads as a win', () => {
    assert.deepEqual(endText(end({ winner: 'p2', outcome: 'conceded', conceded: true, concededBy: 'p1' }), 'p2', 'pl_7f3a9c'), { head: 'You won', detail: 'They conceded.' });
    assert.deepEqual(endText(end({ winner: 'p1', outcome: 'conceded', conceded: true, concededBy: 'p2' }), 'p2', 'pl_7f3a9c').head, 'You conceded');
    assert.deepEqual(endText(end({ winner: 'p2', outcome: 'conceded', conceded: true, concededBy: null }), 'p1', 'rush').head, 'You conceded');
});
