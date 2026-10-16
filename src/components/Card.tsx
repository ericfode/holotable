import { useContext, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Check, Crosshair, Play, Plus, Sparkles, Swords, Undo2, X, type LucideIcon } from 'lucide-react';
import { cardImageUrl, tileLook } from '../lib/cards';
import { isToken } from '../lib/cardText';
import { useSettings } from '../lib/settings';
import type { CardRef, Seat, UnitRef, UpgradeRef } from '../data/types';
import { rowColor } from '../data/terms';
import { digitsOf, unitText } from '../data/format';
import { PickContext, type Pick } from '../play/pick';
import { byTouch, keyboardFocus } from '../lib/touch';
import { Kbd } from './Keys';

/** Leader fronts and bases are printed landscape ('wide'); everything else, a deployed leader included, is portrait ('tall'). */
export type CardShape = 'tall' | 'wide';

/** What a card is worth under the chosen score, drawn on the card. */
export interface CardValue {
    /** the score's value for the card's owner; null for cards the score doesn't count on their own (an undeployed leader) */
    v: number | null;
    seat: Seat;
    /** the owner's bot name */
    owner?: string;
    /** the row of the score the card counts in (row id, terms.ts): sets the chip's colour, the same as that row's total and breakdown row */
    row?: string;
    /** that row's label ("Ground units") */
    rowLabel?: string;
    /** what the value is made of, labelled from the score's terms (the inspector lists them) */
    parts?: { key: string; label: string; points: number }[];
    /** computed here, not read from a lens file (dashed chip) */
    estimated?: boolean;
    /** what the score loses without the card (cardValues "ablation"): values don't add up (dashed chip with ⊖) */
    ablation?: boolean;
    /** 0..1: how this card compares with the most valuable unit on the table (drives the glow) */
    heat?: number;
    /** the value's unit ('points', 'logit', ...) and its decimals */
    unit?: string;
    digits?: number;
    /** the score's label and its badge text (ScoreBadge), for the titles */
    label?: string;
    badge?: string;
    /** a search on this board, for the deciding seat: 0 = the card it picked, negative = how much worse its best move with this card was */
    regret?: number | null;
    /** the search's unit ('prob': regrets in pp) and pick tolerance */
    regretUnit?: string;
    tolerance?: number;
    /** the card's best line ended the game on every line the search tried (score.cardSees; not a proof) */
    sees?: 'win' | 'loss' | null;
    /** the same for the search as a whole: a card under a search that saw a win, whose own line didn't, "misses" it */
    searchSees?: 'win' | 'loss' | null;
    /** the search's kind ("alpha-beta") and the deciding bot */
    searchKind?: string | null;
    searchBot?: string;
}

export interface Focus {
    card: CardRef;
    back: boolean;
    shape: CardShape;
    unit?: UnitRef;
    note?: string;
    value?: CardValue | null;
    kind: 'unit' | 'base' | 'leader' | 'hand';
    /** a base's HP left */
    hpLeft?: number;
    /** where the card is on screen, for the floating zoom */
    rect?: { left: number; top: number; right: number; bottom: number };
    /**
     * opened by a tap on a touch screen: it stays open until the person closes it (a tap outside it, its close button, Esc),
     * where a hovered card closes when the pointer leaves
     */
    touch?: boolean;
}

interface Props {
    card: CardRef;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    shape?: CardShape;
    /** leader flipped to its deployed (unit) side */
    back?: boolean;
    unit?: UnitRef;
    controllerSeat?: Seat;
    /** A staged or playing effect needs one measured chip per physical upgrade. */
    detailedEffects?: boolean;
    /** Deployed leader mirrors keep their zone anchor without duplicating a physical card identity. */
    effectIdentity?: boolean;
    exhausted?: boolean;
    note?: string;
    kind?: Focus['kind'];
    hpLeft?: number;
    /** width in px, overriding the size's width */
    width?: number;
    value?: CardValue | null;
    /** a deployed leader on the board: gets a LEADER badge */
    leader?: boolean;
    /** drawn instead of the generated tile when there is no image (the inspector's text face) */
    face?: ReactNode;
    onFocus?: (f: Focus | null) => void;
    onLeave?: () => void;
}

/** a card value with its unit's decimals (at most 0 from 100 on) */
export function fmtCardValue(v: number, digits = 1): string {
    const s = Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : digits);
    return v < 0 && Number(s) !== 0 ? `−${s}` : s;
}

/** a regret as a tag: "−4.1", "−0.12", or "−4 pp" for a chance */
const fmtRegret = (r: number, unit = 'points') => (unit === 'prob' ? `−${Math.abs(Math.round(r * 100))} pp` : `−${fmtCardValue(Math.abs(r), digitsOf(unit))}`);

/** The chip's title: what the value means in this score. */
function valueTitle(value: CardValue): string {
    const v = value.v ?? 0;
    const label = value.label ?? 'the score';
    const unit = unitText(value.unit ?? 'points');
    const n = fmtCardValue(Math.abs(v), value.digits);
    // the estimate's label already says so
    const est = value.estimated && !label.includes('estimated here') ? ' (estimated here)' : '';
    const text = value.ablation
        ? `${label} ${v >= 0 ? 'loses' : 'gains'} ${n} ${unit} without this card${est}. These values don't add up.`
        : `Worth ${fmtCardValue(v, value.digits)} ${unit} to its owner in ${label}${!value.rowLabel ? '' : label.endsWith(')') ? `, ${value.rowLabel} row` : ` (${value.rowLabel})`}${est}.`;
    return [text, value.badge].filter(Boolean).join('\n');
}

/** The search tag's text, title and class: the pick, a regret, or a line that saw the game end (never a proof). */
export function regretTag(value: CardValue, small: boolean): { text: string; title: string; cls: string } {
    const r = value.regret!;
    const tol = value.tolerance ?? 0.05;
    const unit = value.regretUnit ?? 'points';
    const bot = value.searchBot ?? 'the bot';
    const who = `${value.label ? `${value.label} search` : 'Search'}${value.searchKind ? ` (${value.searchKind})` : ''}`;
    const pick = r >= -tol;
    if (value.sees) {
        const title = `${who}: the search saw the game end on every line it tried with this card (not a proof), with ${bot} ${value.sees === 'win' ? 'winning' : 'losing'}.`
            + (pick ? ` The move ${bot} played starts with this card.` : '');
        // a small card keeps the words and drops the star (the pick class still marks it)
        return { text: pick && !small ? `★ sees ${value.sees}` : `sees ${value.sees}`, title, cls: `sees${pick ? ' pick' : ''}` };
    }
    if (value.searchSees === 'win') {
        // its regret is measured from a sentinel, so the number means nothing
        return { text: 'no win', title: `${who}: the search saw a win for ${bot} with another move, but no line it tried with this card ended in a win (not a proof).`, cls: '' };
    }
    if (pick) {
        return { text: small ? '★' : '★ pick', title: `${who}: the move ${bot} played (or one within ${tol} ${unitText(unit)}) starts with this card.`, cls: 'pick' };
    }
    const by = unit === 'prob' ? `${Math.abs(Math.round(r * 100))} pp of chance` : `${fmtCardValue(Math.abs(r), digitsOf(unit))} ${unitText(unit)}`;
    return { text: fmtRegret(r, unit), title: `${who}: the best move with this card scored ${by} below the move ${bot} played.`, cls: '' };
}

/** The value chip and the search tag the score draws on a card. */
export function LensMarks({ value, size }: { value: CardValue; size: 'sm' | 'md' | 'lg' | 'xl' }) {
    const small = size === 'sm';
    const tag = value.regret != null ? regretTag(value, small) : null;
    return (
        <span className="lens">
            {value.v != null && (
                <span className={`lensv${small ? ' sm' : ''}${value.estimated ? ' est' : ''}${value.ablation ? ' abl' : ''}`} style={{ '--term': rowColor(value.row ?? 'ground') } as CSSProperties} title={valueTitle(value)}>
                    {value.ablation && <span className="abl-mark" aria-hidden="true">⊖</span>}
                    {fmtCardValue(value.v, value.digits)}
                </span>
            )}
            {tag && <span className={`lensr${small ? ' sm' : ''}${tag.cls ? ` ${tag.cls}` : ''}`} title={tag.title}>{tag.text}</span>}
        </span>
    );
}

/**
 * A unit's upgrade tags: copies of one upgrade (Experience, Advantage tokens…) folded into "Name ×N", and at most three
 * tags, the third becoming "+N" (the inspector lists them all), so the stack never reaches the lens chip. On a card whose
 * foot holds a value chip and a search tag, two or more upgrades fold into one "N upgrades" tag.
 */
function upgradeTags(ups: UpgradeRef[], crowded = false) {
    const groups: { n: string; t: 0 | 1; count: number; title: string; cards: UpgradeRef[]; more?: boolean }[] = [];
    for (const u of ups) {
        const g = groups.find((x) => x.n === u.n && x.cards[0].s === u.s && x.cards[0].owner === u.owner && x.cards[0].controller === u.controller);
        if (g) {
            g.count++;
            g.cards.push(u);
            g.title = `${u.n} ×${g.count}`;
        } else {
            groups.push({ n: u.n, t: u.t, count: 1, title: u.n, cards: [u] });
        }
    }
    if (crowded && groups.length > 1) {
        return [{ n: `${ups.length} upgrades`, t: 0 as const, count: 1, title: groups.map((g) => g.title).join(', '), cards: ups, more: true }];
    }
    if (groups.length <= 3) {
        return groups;
    }
    const rest = groups.slice(2);
    return [...groups.slice(0, 2), { n: `+${rest.reduce((a, g) => a + g.count, 0)}`, t: 0 as const, count: 1, title: rest.map((g) => g.title).join(', '), cards: rest.flatMap(g => g.cards), more: true }];
}

/**
 * One card: art when there is some, otherwise a generated tile (tokens, unreleased sets, fixtures).
 * Board-size cards stack their facts from the bottom up so nothing covers anything: name bar, then power/HP, then the
 * lens chip; marks (LEADER, Sentinel) sit top left and upgrades top right.
 */
export function Card({ card, size = 'md', shape = 'tall', back = false, unit, controllerSeat, detailedEffects = false, effectIdentity = true, exhausted = false, note, kind = 'unit', hpLeft, width, value, leader = false, face, onFocus, onLeave }: Props) {
    const art = useSettings((s) => s.art);
    useSettings((s) => s.artVersion);
    // play mode: a card that is a legal click glows and answers the click
    const picker = useContext(PickContext);
    const pickState = picker && card.id ? picker.state(card.id) : null;
    const pickKey = pickState && picker?.keyOf ? picker.keyOf(card.id!) : null;
    // a touch screen's move icon on the card, or the countdown of this card's move waiting to go
    const move = pickState === 'pick' || pickState === 'picked' ? picker?.move?.(card.id!) ?? null : null;
    const waiting = !!card.id && picker?.held === card.id;
    // a move that would change nothing glows grey; the card whose ability asks the question is marked
    const dud = pickState === 'pick' && !!picker?.dud?.(card.id!);
    const asking = !!card.id && picker?.asking === card.id;
    const [failed, setFailed] = useState<string | null>(null);
    // an image whose orientation doesn't match the box (art data can disagree with the card type) is fitted whole, not cropped
    const [mismatch, setMismatch] = useState<string | null>(null);
    const url = art ? cardImageUrl(card.s, back) : null;
    const showImg = url !== null && failed !== url;
    const look = tileLook(card.n, card.s);
    const saboteurLost = unit?.status?.some(status => status.lostKeyword === 'Saboteur');
    const shownStatuses = unit?.status?.filter(status => !(saboteurLost && status.keyword?.name === 'Saboteur') && !(status.keywordWindow && status.keyword?.name === 'Sentinel'));
    const hp = unit ? unit.h - unit.d : null;
    const focusOf = (el: HTMLElement): Focus => {
        const r = el.getBoundingClientRect();
        return { card, back, shape, unit, note, value, kind, hpLeft, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
    };
    // how the last press on this card was made: a finger opens the card (onFocus with touch) instead of hovering or picking it
    const press = useRef('mouse');
    // the card was shown because it took focus from a key, so losing focus hides it (and nothing else does)
    const byFocus = useRef(false);
    const focus = onFocus
        ? {
            // a mouse or pen hovers; a finger's enter and leave come with every tap, which opens the card below instead
            onPointerEnter: (e: PointerEvent<HTMLDivElement>) => {
                if (e.pointerType !== 'touch') {
                    onFocus(focusOf(e.currentTarget));
                }
            },
            onPointerLeave: (e: PointerEvent<HTMLDivElement>) => {
                if (e.pointerType !== 'touch') {
                    onLeave?.();
                }
            },
            // only focus a key moved (Tab, or ⇧ + the card's key) shows the card: a tap or a click focuses it too
            onFocus: (e: FocusEvent<HTMLDivElement>) => {
                byFocus.current = keyboardFocus(e.currentTarget);
                if (byFocus.current) {
                    onFocus(focusOf(e.currentTarget));
                }
            },
            onBlur: () => {
                if (byFocus.current) {
                    byFocus.current = false;
                    onLeave?.();
                }
            },
            tabIndex: 0
        }
        : {};
    /** A tap on a touch screen opens the card (true); a split target takes its tap at once. Any other press is a click. */
    const opened = (el: HTMLElement): boolean => {
        const touch = press.current === 'touch';
        press.current = 'mouse';
        if (!touch || !onFocus || (pickState && picker?.instant?.(card.id!))) {
            return false;
        }
        onFocus({ ...focusOf(el), touch: true });
        return true;
    };
    const lensed = value && (value.v != null || value.regret != null);
    const heat = value?.heat ?? 0;
    // board-size cards print their name in a bar at the bottom (one line over art, up to two on a tile)
    const named = size === 'md';
    const stats = !!unit && size !== 'sm';
    const ups = !!unit?.u?.length && size !== 'sm';
    const upgrades = detailedEffects
        ? (unit?.u ?? []).map(u => ({ n: u.n, t: u.t, count: 1, title: u.n, cards: [u], more: false }))
        : upgradeTags(unit?.u ?? [], value?.v != null && value.regret != null);
    // captured cards (v2): a mark with their names in the title; the inspector lists them
    const cap = size !== 'sm' ? unit?.cap ?? [] : [];
    // tokens (Battle Droid, Shield…) have no set number; a text face that says "Token unit" makes the tag redundant
    const token = (unit?.t === 1 || isToken(card)) && (showImg || !face);
    const cls = ['card', size !== 'md' ? size : '', shape === 'wide' ? 'wide' : '', exhausted ? 'exh' : '', lensed ? 'lensed' : '', showImg ? 'art' : '', named ? 'named' : '', pickState === 'pick' ? 'pickable' : pickState === 'picked' ? 'picked' : '', dud ? 'dud' : '', asking ? 'asking' : ''].filter(Boolean).join(' ');
    const pressProps = onFocus || pickState
        ? {
            onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
                press.current = e.pointerType;
            }
        }
        : {};
    const pickProps = pickState
        ? {
            role: 'button',
            tabIndex: 0,
            onClick: (e: MouseEvent<HTMLDivElement>) => {
                if (!opened(e.currentTarget)) {
                    picker!.pick(card.id!);
                }
            },
            onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    // a held key, or one pressed as the next decision arrives, picks nothing
                    if (!e.repeat && picker!.keyReady?.() !== false) {
                        picker!.pick(card.id!);
                    }
                }
            }
        }
        : onFocus ? { onClick: (e: MouseEvent<HTMLDivElement>) => void opened(e.currentTarget) } : {};
    const style = {
        ...(width ? { '--w': `${width}px` } : {}),
        // the glow: the card's score colour, stronger the closer it is to the most valuable unit on the table
        ...(lensed && heat > 0.05 ? {
            '--term': rowColor(value?.row ?? 'ground'),
            boxShadow: `0 0 0 2px color-mix(in oklab, var(--term) ${Math.round(25 + heat * 75)}%, transparent), 0 0 ${Math.round(6 + heat * 22)}px -2px color-mix(in oklab, var(--term) ${Math.round(heat * 80)}%, transparent)`
        } : {})
    } as CSSProperties;
    return (
        <div className={cls} style={style} title={card.n} {...focus} {...pressProps} {...pickProps}
            data-effect-card={effectIdentity ? card.n : undefined} data-effect-code={effectIdentity ? card.s ?? undefined : undefined} data-effect-id={effectIdentity ? card.id : undefined} data-effect-base={kind === 'base' ? '' : undefined} data-effect-zone={kind === 'leader' ? 'leader' : undefined}
            aria-label={(leader ? 'Leader ' : '') + card.n + (unit ? `, ${unit.p} power, ${hp} HP left${unit.d > 0 ? ` (${unit.d} damage)` : ''}` : '') + (unit?.sn ? ', Sentinel' : '') + (unit?.cap?.length ? `, holds captured ${unit.cap.map((c) => c.n).join(', ')}` : '') + (exhausted ? ', exhausted' : '') + (value?.v != null ? `, worth ${fmtCardValue(value.v, value.digits)}` : '') + (dud ? ', no effect now' : '') + (asking ? ', asking' : '')}>
            {showImg ? (
                <>
                    {mismatch === url && <img src={url} alt="" draggable={false} className="backdrop" />}
                    <img src={url} alt="" loading="lazy" draggable={false} className={mismatch === url ? 'whole' : undefined} onError={() => setFailed(url)}
                        onLoad={(e) => {
                            const im = e.currentTarget;
                            if (im.naturalWidth && (im.naturalWidth > im.naturalHeight) !== (shape === 'wide')) {
                                setMismatch(url);
                            }
                        }} />
                </>
            ) : face ?? (
                <div className="tile" style={{ '--a': look.a, '--b': look.b, '--ang': `${look.angle}deg`, ...(look.grad ? { background: `radial-gradient(circle at 30% 20%, #ffffff22, transparent 55%), ${look.grad}` } : {}) } as CSSProperties}>
                    <span className="mono">{look.mono}</span>
                    <span className="nm">{card.n}</span>
                </div>
            )}
            {pickKey && <Kbd k={pickKey} className="pick-key" />}
            {dud && <span className="dud-mark" title="Playing or using this now would change nothing">No effect</span>}
            {(move || waiting) && <MoveChip id={card.id!} name={card.n} move={move} waiting={waiting} dud={dud} picker={picker!} />}
            {(leader || unit?.sn || token || ups || cap.length > 0) && (
                <div className="top">
                    {(leader || unit?.sn || token || cap.length > 0) && (
                        <span className="marks">
                            {leader && <span className="mark leader" title="This player's leader, deployed">Leader</span>}
                            {token && <span className="mark token" title="Token: created during play, not a card from a deck">TOKEN</span>}
                            {unit?.sn ? <span className="mark sentinel" title="Sentinel" data-effect-generated-sentinel-mark-id={unit.status?.find(status => status.generatedSentinel)?.generatedSentinel?.id}>SEN</span> : null}
                            {cap.length > 0 && <span className="mark cap" title={`Holds ${cap.length} captured card${cap.length > 1 ? 's' : ''}: ${cap.map((c) => c.n).join(', ')}`}>CAP{cap.length > 1 ? ` ${cap.length}` : ''}</span>}
                        </span>
                    )}
                    {ups && (
                        <div className="ups">
                            {upgrades.map((g, i) => {
                                // Ordinary boards fold copies; detailed effect presentations retain every physical chip.
                                const u = g.cards.length === 1 ? g.cards[0] : undefined;
                                const transferred = !!u?.controller && !!u.owner && u.controller !== u.owner;
                                return <span key={`${g.n}:${i}`} className={`up${g.t ? ' token' : ''}${g.t && g.n === 'Shield' ? ' shield' : ''}${g.more ? ' more' : ''}${u?.s === 'SOR_054' ? ' lightsaber' : ''}${transferred ? ' transferred' : ''}`}
                                    title={`${g.title}${u?.owner ? ` · owner ${u.owner.toUpperCase()}` : ''}${u?.controller ? ` · control ${u.controller.toUpperCase()}` : ''}`}
                                    data-effect-upgrade={u?.n} data-effect-code={u?.s ?? undefined} data-effect-id={u?.id} data-effect-owner={u?.owner} data-effect-controller={u?.controller}>
                                    {transferred ? <><span className="up-name">{g.n}</span><small>O:{u!.owner!.toUpperCase()} C:{u!.controller!.toUpperCase()}</small></> : <>{g.n}{g.count > 1 ? ` ×${g.count}` : ''}</>}
                                </span>;
                            })}
                        </div>
                    )}
                </div>
            )}
            {(lensed || stats || named || !!shownStatuses?.length) && (
                <div className="foot">
            {shownStatuses?.length ? <div className="card-statuses" style={{ position: 'static', marginInline: 2 }}>{shownStatuses.map((status, i) =>
                <span key={`${status.kind}:${i}`} className={`card-status ${status.kind}${status.lostKeyword && status.keywordWindow ? ' keyword-window' : ''}${status.grantedAbility ? ' granted' : ''}${status.generatedRestriction ? ' generated-restriction' : ''}${status.generatedSentinel ? ' generated-sentinel' : ''}${status.keyword?.name === 'Restore' ? ' restore' : ''}${status.keyword?.name === 'Overwhelm' && status.duration === 'phase' ? ' overwhelm' : ''}`} title={status.label} data-effect-constraint={status.actionConstraintId} data-effect-duration={status.duration} data-effect-title-boost-id={status.titleBoost?.id} data-effect-generated-restriction-id={status.generatedRestriction?.id} data-effect-generated-sentinel-id={status.generatedSentinel?.id}>{status.lostKeyword === 'Saboteur' && status.keywordWindow ? unit?.sn ? <>SENTINEL · PHASE<br />NO SABOTEUR</> : <>NO SABOTEUR<br />PHASE</> : status.generatedRestriction && status.restriction === 'cannot-attack-base' ? <>NO BASE<br />PHASE</> : status.generatedSentinel ? <>SENTINEL<br />PHASE</> : status.grantedAbility ? <>WHEN DEFEATED<br />{status.grantedAbility.effect === 'create-clone' ? 'CREATE CLONE' : 'ENEMY UNIT 2'}<br />PHASE</> : status.keyword?.name === 'Restore' ? <>RESTORE {status.keyword.amount}{status.duration === 'phase' ? ' · PHASE' : ''}</> : status.keyword?.name === 'Overwhelm' && status.duration === 'phase' ? <>OVERWHELM<br />PHASE</> : status.restriction === 'must-attack' && status.duration === 'next-action' ? <>NEXT {controllerSeat?.toUpperCase()} ACTION<br />ATTACK IF ABLE</> : status.label}</span>
            )}</div> : null}
                    {lensed && <LensMarks value={value!} size={size} />}
                    {stats && (
                        <div className="stats">
                            <span className="stat pw">{unit!.p}</span>
                            <span className={`stat hp${unit!.d > 0 ? ' hurt' : ''}`}>
                                {unit!.d > 0 && <span className="dmg" title={`${unit!.d} damage`}>{unit!.d}</span>}
                                {hp}
                            </span>
                        </div>
                    )}
                    {named && <span className="nmbar">{card.n}</span>}
                </div>
            )}
        </div>
    );
}

const MOVE_ICONS: Record<NonNullable<ReturnType<NonNullable<Pick['move']>>>['icon'], LucideIcon> = {
    play: Play, attack: Swords, use: Sparkles, choose: Crosshair, select: Check, unselect: X, add: Plus
};

/**
 * A card's move as an icon on the card (play mode, touch screens only: keyboards get the key cap in the same place). A
 * tap makes the move, which then waits a moment: the icon becomes a countdown ring, and a tap on it takes the move back.
 */
function MoveChip({ id, name, move, waiting, dud, picker }: { id: string; name: string; move: { icon: keyof typeof MOVE_ICONS; label: string } | null; waiting: boolean; dud: boolean; picker: Pick }) {
    const Icon = waiting ? Undo2 : MOVE_ICONS[move!.icon];
    return (
        // the card itself is the keyboard's way to pick, so the icon takes no focus
        <button type="button" tabIndex={-1} className={`move-chip ${waiting ? 'held' : move!.icon}${dud && !waiting ? ' dud' : ''}`} aria-label={waiting ? `Take back the move with ${name}` : `${move!.label} ${name}${dud ? ' (no effect)' : ''}`}
            onClick={(e) => {
                // the card under it would open
                e.stopPropagation();
                if (waiting) {
                    picker.undo?.();
                } else {
                    picker.pick(id, byTouch());
                }
            }}>
            {waiting && <svg className="ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16" /></svg>}
            <Icon aria-hidden="true" strokeWidth={2.6} />
        </button>
    );
}

export function CardBack({ size = 'md', value }: { size?: 'sm' | 'md'; value?: CardValue | null }) {
    return (
        <div className={`card card-back${size === 'sm' ? ' sm' : ''}`} aria-hidden="true">
            {value && value.regret != null && <div className="foot"><LensMarks value={{ ...value, v: null }} size={size} /></div>}
        </div>
    );
}

/** Captives are public references in a separate pocket, with no arena stats or unit identity marker. */
export function CapturedPocket({ unit, seat }: { unit: UnitRef; seat: Seat }) {
    const art = useSettings(state => state.art);
    useSettings(state => state.artVersion);
    if (unit.cap === undefined) return null;
    return <div className={`captured-pocket${unit.cap.length > 1 ? ' multi' : ''}`} data-effect-pocket={unit.id ?? ''} data-effect-captor-seat={seat} aria-label={`${unit.n} guards ${unit.cap.length} captured cards`}>
        <span className="captured-count" data-effect-capture-count><span>CAPTIVE</span><b>{unit.cap.length}</b></span>
        <div className="captured-slots">{unit.cap.map((card, i) => {
            const image = art ? cardImageUrl(card.s) : null;
            return <span key={card.id ?? `${card.s}:${i}`} className="captured-slot" data-effect-captured={card.n} data-effect-id={card.id} data-effect-code={card.s ?? undefined} data-effect-owner={card.owner}
                title={`${card.n} · captured by ${unit.n}${card.owner ? ` · owner ${card.owner.toUpperCase()}` : ''}`}>
                {image ? <img src={image} alt={card.n} loading="lazy" draggable={false} /> : <span className="captured-unknown" aria-label={card.n}>◇</span>}
                {card.owner && <small>{card.owner.toUpperCase()}</small>}
            </span>;
        })}</div>
    </div>;
}
