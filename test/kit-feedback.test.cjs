// What is on screen, for a host page's feedback box (src/kit/feedback.ts, SWUViewer.feedbackContext()).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript5');

const filename = path.join(__dirname, '../src/kit/feedback.ts');
const mod = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
const { feedbackContext, reportOnScreen } = mod.exports;

test('each mounted view reports what it shows now, until it is gone', () => {
    assert.deepEqual(feedbackContext(), []);
    let step = 3;
    const offReplay = reportOnScreen(() => ({ kind: 'replay', step }));
    const offPlay = reportOnScreen(() => ({ kind: 'play', game: 'g1' }));
    reportOnScreen(() => null); // a viewer with no game yet says nothing
    assert.deepEqual(feedbackContext(), [{ kind: 'replay', step: 3 }, { kind: 'play', game: 'g1' }]);
    step = 9;
    assert.deepEqual(feedbackContext()[0], { kind: 'replay', step: 9 }, 'read when asked, not when mounted');
    offReplay();
    offReplay();
    assert.deepEqual(feedbackContext(), [{ kind: 'play', game: 'g1' }]);
    offPlay();
});

test('a view that throws is listed with its error, and the others still report', () => {
    const offBad = reportOnScreen(() => {
        throw new Error('no board yet');
    });
    const offGood = reportOnScreen(() => ({ kind: 'replay', step: 1 }));
    assert.deepEqual(feedbackContext().filter((r) => r.kind !== undefined), [{ kind: 'error', error: 'no board yet' }, { kind: 'replay', step: 1 }]);
    offBad();
    offGood();
});
