const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript5');
const filename = path.join(__dirname, '../src/lib/fullscreen.ts');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText)(mod, mod.exports);
const { fullscreenSession } = mod.exports;

function style(value = '', priority = '') {
    return {
        value, priority,
        getPropertyValue() { return this.value; }, getPropertyPriority() { return this.priority; },
        setProperty(_key, value, priority = '') { Object.assign(this, { value, priority }); },
        removeProperty() { this.value = ''; this.priority = ''; }
    };
}
function setup({ native = true, shadow = false, request, exit } = {}) {
    const doc = Object.assign(new EventTarget(), {
        fullscreenElement: null, fullscreenEnabled: native, visibilityState: 'visible',
        documentElement: { style: style('scroll', 'important') }, body: { style: style() }
    });
    let observer;
    doc.defaultView = Object.assign(new EventTarget(), {
        requestAnimationFrame: (f) => f(),
        getComputedStyle: el => ({ display: el.display ?? 'block', visibility: 'visible' }),
        MutationObserver: class { constructor(f) { observer = this; this.fire = f; } observe() {} disconnect() { this.disconnected = true; } }
    });
    const host = { hidden: false, parentElement: null, getRootNode: () => doc, hasAttribute: key => key === 'hidden' && host.hidden };
    const tree = shadow ? { fullscreenElement: null, host } : doc;
    let focus = 0, requests = 0, exits = 0;
    const el = {
        ownerDocument: doc, isConnected: true, visible: true, parentElement: null,
        hasAttribute: key => key === 'hidden' && !!el.hidden,
        getRootNode: () => tree, getClientRects: () => el.visible ? [1] : [],
        querySelector: () => ({ focus: () => focus++ })
    };
    if (native) el.requestFullscreen = () => {
        requests++;
        return request ? request() : Promise.resolve().then(() => {
            tree.fullscreenElement = el;
            doc.fullscreenElement = shadow ? { host: true } : el;
            doc.dispatchEvent(new Event('fullscreenchange'));
        });
    };
    doc.exitFullscreen = () => {
        exits++;
        if (exit) return exit();
        tree.fullscreenElement = doc.fullscreenElement = null;
        doc.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
    };
    let state;
    const session = fullscreenSession(el, s => { state = s; });
    return { doc, el, host, tree, session, observer, state: () => state, counts: () => ({ focus, requests, exits }) };
}

test('native entry stays in the user gesture, repeated toggles and browser exits follow the actual state', async () => {
    const h = setup();
    assert.equal(h.counts().requests, 0);
    const pending = h.session.toggle();
    assert.equal(h.counts().requests, 1, 'request must run before yielding');
    assert.equal(h.state().pending, true);
    await h.session.toggle(); // double activation cannot start a second request
    await pending;
    assert.equal(h.counts().requests, 1);
    assert.equal(h.state().mode, 'fullscreen');
    await h.session.toggle();
    assert.equal(h.state().mode, 'inline');
    await h.session.toggle();
    await h.doc.exitFullscreen(); // browser Escape or browser UI
    assert.equal(h.state().mode, 'inline');
    assert.ok(h.counts().focus >= 2);
    h.session.destroy();
});

test('shadow-root fullscreen uses its actual element, rather than the document host', async () => {
    const h = setup({ shadow: true });
    await h.session.toggle();
    assert.notEqual(h.doc.fullscreenElement, h.el);
    assert.equal(h.state().mode, 'fullscreen');
    h.session.destroy();
    assert.equal(h.counts().exits, 1);
});

test('unsupported and rejected native requests maximize honestly, consume Escape, and restore exact page styles', async () => {
    for (const options of [{ native: false }, { request: () => Promise.reject(new Error('not granted')) }]) {
        const h = setup(options);
        await h.session.toggle();
        assert.equal(h.state().mode, 'maximized');
        assert.match(h.state().notice, /Browser controls remain visible/);
        assert.equal(h.doc.body.style.value, 'hidden');
        const e = new Event('keydown', { cancelable: true });
        Object.defineProperty(e, 'key', { value: 'Escape' });
        h.doc.defaultView.dispatchEvent(e);
        assert.equal(e.defaultPrevented, true);
        assert.equal(h.state().mode, 'inline');
        assert.equal(h.doc.body.style.value, '');
        assert.equal(h.doc.documentElement.style.value, 'scroll');
        assert.equal(h.doc.documentElement.style.priority, 'important');
        h.session.destroy();
    }
});

test('hiding the host or tab releases fallback scrolling; destroying it removes observers and keys', async () => {
    for (const hide of ['host', 'tab', 'destroy']) {
        const h = setup({ native: false });
        await h.session.toggle();
        if (hide === 'host') { h.el.visible = false; h.observer.fire(); }
        if (hide === 'tab') { h.doc.visibilityState = 'hidden'; h.doc.dispatchEvent(new Event('visibilitychange')); }
        h.session.destroy();
        assert.equal(h.doc.body.style.value, '');
        assert.equal(h.observer.disconnected, true);
        const e = new Event('keydown', { cancelable: true });
        Object.defineProperty(e, 'key', { value: 'Escape' });
        h.doc.defaultView.dispatchEvent(e);
        assert.equal(e.defaultPrevented, false);
    }
});

test('navigation during a pending native request never maximizes or leaves an orphan fullscreen element', async () => {
    let resolve;
    const h = setup({ request: () => new Promise(r => { resolve = r; }) });
    const pending = h.session.toggle();
    h.session.destroy();
    const lastState = h.state();
    h.doc.fullscreenElement = h.el;
    resolve();
    await pending;
    assert.equal(h.doc.fullscreenElement, null);
    assert.equal(h.counts().exits, 1);
    assert.equal(h.state(), lastState, 'no updates after unmount');
});

test('a rejected request interrupted by another fullscreen target or hidden tab does not expand', async () => {
    for (const interrupt of ['fullscreen', 'hidden']) {
        let reject;
        const h = setup({ request: () => new Promise((_r, j) => { reject = j; }) });
        const pending = h.session.toggle();
        if (interrupt === 'fullscreen') h.doc.fullscreenElement = {};
        else h.doc.visibilityState = 'hidden';
        reject(new Error('not granted'));
        await pending;
        assert.equal(h.state().mode, 'inline');
        assert.equal(h.doc.body.style.value, '');
        h.session.destroy();
    }
});

test('failed exit keeps an accurate active state and explains the browser exit option', async () => {
    const h = setup({ exit: () => Promise.reject(new Error('denied')) });
    await h.session.toggle();
    await h.session.toggle();
    assert.equal(h.state().mode, 'fullscreen');
    assert.equal(h.state().pending, false);
    assert.match(h.state().notice, /Escape/);
    h.doc.fullscreenElement = null;
    h.doc.dispatchEvent(new Event('fullscreenchange'));
    assert.equal(h.state().mode, 'inline');
    assert.equal(h.state().notice, '');
    h.session.destroy();
});

test('native fullscreen leaves a hidden host even when the top-layer target still has a rect', async () => {
    for (const hide of ['hidden', 'display']) {
        const h = setup({ shadow: true });
        await h.session.toggle();
        assert.equal(h.state().mode, 'fullscreen');
        if (hide === 'hidden') h.host.hidden = true;
        else h.host.display = 'none';
        assert.equal(h.el.getClientRects().length, 1);
        h.observer.fire();
        await Promise.resolve();
        assert.equal(h.doc.fullscreenElement, null);
        assert.equal(h.state().mode, 'inline');
        assert.equal(h.counts().exits, 1);
        h.session.destroy();
    }
});
