/**
 * What the play start screen offers, from a table's options (pure, so tests can run it): the mode tabs, the one it
 * opens on, and how a bot reads in the opponent picker.
 */
import type { BotInfo, DeckOption, PeopleMode, Prep, TableOptions } from './client';

export type StartMode = 'bot' | 'lobby' | 'invite' | 'join';

export const MODE_NAMES: Record<StartMode, string> = { bot: 'Play a bot', lobby: 'Find a game', invite: 'Invite a friend', join: 'Join a friend' };

/**
 * The mode tabs: playing a bot always, then each people mode the table offers ('direct' adds inviting and joining).
 * `canPair` false (a table without pair()) leaves only the bot.
 */
export function startModes(opts: Pick<TableOptions, 'people'>, canPair = true): StartMode[] {
    const has = (m: PeopleMode) => (canPair && opts.people?.includes(m)) ?? false;
    const out: StartMode[] = ['bot'];
    if (has('lobby')) {
        out.push('lobby');
    }
    if (has('invite') || has('direct')) {
        out.push('invite');
    }
    if (has('join') || has('direct')) {
        out.push('join');
    }
    return out;
}

/** The tab the screen opens on: "Join a friend" when the address brought a code and joining is offered. */
export function firstMode(modes: StartMode[], join: string | null | undefined): StartMode {
    return join && modes.includes('join') ? 'join' : 'bot';
}

/** A download size in megabytes, as the picker shows it. */
export function sizeText(bytes: number): string {
    const mb = bytes / 1e6;
    return mb >= 10 ? `${Math.round(mb)} MB` : mb >= 0.1 ? `${mb.toFixed(1)} MB` : '< 0.1 MB';
}

/** A bot as the opponent picker lists it: its title (else its name), then its rating and its size when known. */
export function botLabel(name: string, info?: BotInfo | null): string {
    let out = info?.title || name;
    if (typeof info?.elo === 'number' && Number.isFinite(info.elo)) {
        out += ` · ${Math.round(info.elo)}`;
    }
    if (typeof info?.bytes === 'number' && Number.isFinite(info.bytes) && info.bytes >= 0) {
        out += ` · ${sizeText(info.bytes)}`;
    }
    return out;
}

/** The line under the picked bot: who made it and its note, or '' when the table says neither. */
export function botAbout(info?: BotInfo | null): string {
    return [info?.owner ? `by ${info.owner}` : null, info?.note || null].filter(Boolean).join(' · ');
}

/** The two letters on a bot's emblem in the versus screen: the first letters of its first two words ("c-clock3me-s" CC). */
export function initials(name: string): string {
    const words = name.replace(/'s\b/gi, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const out = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
    return out.toUpperCase();
}

/** A colour for a bot's emblem that stays the same for its name (a hue, 0-359). */
export function nameHue(name: string): number {
    let h = 0;
    for (const ch of name) {
        h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
    }
    return h % 360;
}

const titleCase = (slug: string) => slug.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/**
 * A deck's two names for the versus screen, its leader and its base: from the card text when the page has it, else from
 * the list's name, which reads leader_set_base ("the-armorer_ash_nabat-village": The Armorer, Nabat Village).
 */
export function deckNames(d: DeckOption, title: (setCode: string) => string | null | undefined): { leader: string; base: string } {
    const parts = d.name.split('_');
    const fromName = parts.length >= 3 ? { leader: titleCase(parts[0]), base: titleCase(parts[parts.length - 1]) } : { leader: d.name, base: d.base };
    return { leader: title(d.leader) || fromName.leader, base: title(d.base) || fromName.base };
}

/**
 * What the Play button adds after "Play" for a bot: what is left to download, a wait, or nothing once it is all here.
 * `prep` is the table's report (Table.prepare); before one comes, the bot's size from its info.
 */
export function prepText(prep: Prep | null, info?: BotInfo | null): string {
    if (prep?.ready) {
        return '';
    }
    if (prep?.waiting) {
        return 'on its way';
    }
    if (prep && typeof prep.left === 'number' && prep.left > 0) {
        return `${sizeText(prep.left)} to go`;
    }
    if (!prep && typeof info?.bytes === 'number' && info.bytes > 0) {
        return `${sizeText(info.bytes)} to go`;
    }
    return '';
}

/**
 * The loading bar under the versus screen's Play button: how much of what the game needs is here (`done` from 0 to 1,
 * null while that is not known: the bar then moves without filling) and a line saying what. Null when there is nothing
 * to wait for, or an error to show instead.
 */
export function meterOf(prep: Prep | null): { done: number | null; text: string } | null {
    if (!prep || prep.ready || prep.error) {
        return null;
    }
    const known = typeof prep.total === 'number' && prep.total > 0 && typeof prep.left === 'number';
    const done = known ? Math.min(1, Math.max(0, (prep.total! - prep.left!) / prep.total!)) : null;
    if (prep.note) {
        return { done: prep.waiting ? null : done, text: prep.note };
    }
    if (prep.waiting) {
        return { done: null, text: 'The arena is sending the files' };
    }
    if (known && prep.left! > 0) {
        return { done, text: `${sizeText(prep.total! - prep.left!)} of ${sizeText(prep.total!)}` };
    }
    if (known) {
        return { done: null, text: 'Starting the rules engine' };
    }
    return null;
}
