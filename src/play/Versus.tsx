import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Play } from 'lucide-react';
import { Card } from '../components/Card';
import { cardTextBySet } from '../lib/cardText';
import type { Prep, TableOptions } from './client';
import { botAbout, deckNames, initials, meterOf, nameHue, prepText } from './modes';

const RANDOM = 'random';
/** a slide this far sideways (px), and more sideways than up or down, changes the pick */
const SWIPE_PX = 40;
/** more picks than this show as "3 / 24" instead of dots */
const MAX_DOTS = 9;

/** One side's carousel: the previous and next buttons around the face, and a sideways slide on it. */
function Stage({ label, count, onStep, disabled, children }: { label: string; count: number; onStep: (by: 1 | -1) => void; disabled: boolean; children: ReactNode }) {
    const down = useRef<{ x: number; y: number } | null>(null);
    const many = count > 1 && !disabled;
    const start = (e: ReactPointerEvent) => {
        down.current = (e.target as Element).closest('button, select, input, textarea, a') ? null : { x: e.clientX, y: e.clientY };
    };
    const end = (e: ReactPointerEvent) => {
        const d = down.current;
        down.current = null;
        if (!d || !many) {
            return;
        }
        const dx = e.clientX - d.x;
        if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - d.y)) {
            onStep(dx < 0 ? 1 : -1);
        }
    };
    return (
        <div className="vs-stage" onPointerDown={start} onPointerUp={end} onPointerCancel={() => (down.current = null)}>
            <button type="button" className="vs-arrow" aria-label={`Previous ${label}`} disabled={!many} onClick={() => onStep(-1)}><ChevronLeft size={20} /></button>
            <div className="vs-face">{children}</div>
            <button type="button" className="vs-arrow" aria-label={`Next ${label}`} disabled={!many} onClick={() => onStep(1)}><ChevronRight size={20} /></button>
        </div>
    );
}

/** How much of what the game needs is here, under the Play button (modes.ts meterOf). */
function Meter({ prep }: { prep: Prep | null }) {
    const m = meterOf(prep);
    if (!m) {
        return null;
    }
    const pct = m.done === null ? null : Math.round(m.done * 100);
    return (
        <div className="vs-meter" role="progressbar" aria-label="Getting the game ready" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-valuetext={m.text}>
            <div className={`vs-track${pct === null ? ' busy' : ''}`}><i style={pct === null ? undefined : { width: `${pct}%` }} /></div>
            <div className="vs-meter-text"><span>{m.text}</span>{pct !== null && <b>{pct}%</b>}</div>
        </div>
    );
}

function Dots({ count, index }: { count: number; index: number }) {
    if (count < 2) {
        return null;
    }
    return count > MAX_DOTS
        ? <span className="vs-count">{index + 1} / {count}</span>
        : <span className="vs-dots" aria-hidden="true">{Array.from({ length: count }, (_, i) => <i key={i} className={i === index ? 'on' : ''} />)}</span>;
}

/**
 * The start screen for a game against a bot, face to face like a fighting game: the bot on one side (top on a phone,
 * right on a wide screen), the person's deck on the other, and one Play button. Each side changes with its arrows, a
 * sideways slide or its list. While the person chooses, the table fetches what the shown bot needs (Table.prepare), and
 * the Play button says what is left.
 */
export function Versus({ opts, bot, onBot, deck, onDeck, botDeck, onBotDeck, busy, error, prep, onPlay, deckExtra }: {
    opts: TableOptions; bot: string; onBot: (b: string) => void; deck: string; onDeck: (d: string) => void; botDeck: string; onBotDeck: (d: string) => void;
    busy: boolean; error: string | null; prep: Prep | null; onPlay: () => void; deckExtra?: ReactNode;
}) {
    const info = opts.botInfo?.[bot] ?? null;
    const bi = Math.max(0, opts.bots.indexOf(bot));
    const di = Math.max(0, opts.decks.findIndex((d) => d.name === deck));
    const d = opts.decks[di] ?? null;
    const step = <T,>(list: T[], i: number, by: number) => list[(i + by + list.length) % list.length];
    const title = info?.title || bot;
    const elo = typeof info?.elo === 'number' && Number.isFinite(info.elo) ? `Elo ${Math.round(info.elo)}` : null;
    const about = botAbout(info);
    const names = d ? deckNames(d, (code) => cardTextBySet(code)?.t) : null;
    const why = info?.unavailable || null;
    const left = prepText(prep, info);
    const pct = busy && prep && prep.total ? Math.round((100 * (prep.total - (prep.left ?? 0))) / prep.total) : null;
    const hue = nameHue(bot);
    // the leader's card: smaller on a phone, so the Play button stays in sight
    const leaderW = typeof window !== 'undefined' && window.matchMedia?.('(min-width: 760px)').matches ? 232 : 196;
    return (
        <div className="versus">
            <section className="vs-side vs-bot" aria-label="Your opponent">
                <Stage label="opponent" count={opts.bots.length} onStep={(by) => onBot(step(opts.bots, bi, by))} disabled={busy}>
                    <div className={`vs-emblem${info?.featured ? ' featured' : ''}`} style={{ '--hue': hue } as CSSProperties} aria-hidden="true">{initials(title)}</div>
                </Stage>
                <h2 className="vs-name">{title}</h2>
                {(elo || about) && <p className="vs-meta">{[elo, about].filter(Boolean).join(' · ')}</p>}
                <Dots count={opts.bots.length} index={bi} />
                <div className="vs-lists">
                    {opts.bots.length > 1 && (
                        <select id="play-bot" className="play-select" aria-label="Bot" value={bot} disabled={busy} onChange={(e) => onBot(e.target.value)}>
                            {opts.bots.map((b) => <option key={b} value={b}>{opts.botInfo?.[b]?.title || b}</option>)}
                        </select>
                    )}
                    <select id="play-bot-deck" className="play-select" aria-label="The bot's deck" value={botDeck} disabled={busy} onChange={(e) => onBotDeck(e.target.value)}>
                        <option value={RANDOM}>Its deck: random</option>
                        {opts.decks.map((x) => <option key={x.name} value={x.name}>Its deck: {x.name}{x.style ? ` · ${x.style}` : ''}</option>)}
                    </select>
                </div>
            </section>
            <div className="vs-mark" aria-hidden="true"><span>VS</span></div>
            <section className="vs-side vs-you" aria-label="Your deck">
                <Stage label="deck" count={opts.decks.length} onStep={(by) => onDeck(step(opts.decks, di, by).name)} disabled={busy}>
                    {d && <Card key={d.name} card={{ id: 'vs-leader', n: names!.leader, s: d.leader }} shape="wide" kind="leader" size="lg" width={leaderW} />}
                </Stage>
                <h2 className="vs-name"><span className="vs-you-word">You</span> · {names?.leader ?? 'no deck'}</h2>
                {names && <p className="vs-meta">{names.base}{d?.style ? ` · ${d.style}` : ''}</p>}
                <Dots count={opts.decks.length} index={di} />
                <div className="vs-lists">
                    <select id="play-deck" className="play-select" aria-label="Your deck" value={deck} disabled={busy} onChange={(e) => onDeck(e.target.value)}>
                        {opts.decks.map((x) => <option key={x.name} value={x.name}>{x.name}{x.style ? ` · ${x.style}` : ''}</option>)}
                    </select>
                </div>
                {deckExtra}
            </section>
            <div className="vs-go">
                <button type="button" className="play-btn primary vs-play" onClick={onPlay} disabled={busy || !bot || !deck || !!why}>
                    {busy ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
                    <span>{busy ? 'Getting ready' : 'Play'}</span>
                    {busy ? pct != null && pct < 100 && <span className="vs-left">· {pct}%</span> : left && <span className="vs-left">· {left}</span>}
                </button>
                {!why && <Meter prep={prep} />}
                {why ? <p className="vs-why">{why}</p> : prep?.error ? <p className="vs-why">{prep.error}</p> : null}
                {error && <p className="vs-why">{error}</p>}
            </div>
        </div>
    );
}
