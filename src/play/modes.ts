/**
 * What the play start screen offers, from a table's options (pure, so tests can run it): the mode tabs, the one it
 * opens on, and how a bot reads in the opponent picker.
 */
import type { BotInfo, PeopleMode, TableOptions } from './client';

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
