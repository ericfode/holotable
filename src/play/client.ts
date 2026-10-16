/**
 * Where a game is played. The page plays through a `Table`: by default the arena's HTTP table (its bot/table/serve.js:
 * options, start a game, follow it as server-sent events, answer decisions, concede), at the page's own origin under
 * /table/api or at `?table=<url>` in the hash route. A host page can give its own (the viewer kit's mountPlay: the
 * arena window's /play runs the referee and the bot in a worker of the person's tab).
 */
import { createContext } from 'react';
import type { Act, TableMsg } from './protocol';
import type { Seat } from '../data/types';
import { hashParam } from '../lib/route';

export interface DeckOption { name: string; leader: string; base: string; style: string | null }
/** A bot's row in the opponent picker: its title (else its name), who made it, its rating, a note, its download size. */
export interface BotInfo {
    title?: string | null;
    owner?: string | null;
    elo?: number | null;
    note?: string | null;
    bytes?: number | null;
    /** why this browser cannot play the bot (the versus screen says so and keeps Play off), or null */
    unavailable?: string | null;
    /** the table's own pick: its emblem is gold */
    featured?: boolean;
}
/**
 * What a table still has to fetch before a game with a bot can start, as Table.prepare reports it: all here (ready),
 * bytes left of the total, waiting on the arena to send a file, or the last download's error (start() tries again).
 */
export interface Prep { ready: boolean; left: number | null; total: number | null; waiting?: boolean; error?: string | null }
/** How a person can find another person at an open table: the lobby, an invite link, joining one, or codes pasted by hand. */
export type PeopleMode = 'lobby' | 'invite' | 'join' | 'direct';
/**
 * botDeck: the list the bot gets unless the person picks one, or 'random' (one picked by each game's seed). Everything
 * after it is optional; playing a bot is always the versus screen, and the rest adds to it.
 */
export interface TableOptions {
    bots: string[];
    decks: DeckOption[];
    botDeck: string;
    /** richer rows for the bots, by name: shown in the opponent picker */
    botInfo?: Record<string, BotInfo>;
    /** what the start screen offers besides playing a bot (default none) */
    people?: PeopleMode[];
    /** the start screen has a box to add a deck from a SWUDB link or a pasted list (Table.importDeck) */
    importDeck?: boolean;
    /** your name as other players see it (a random id like pl_7f3a9c) */
    you?: string | null;
    /** a code from the page's address: open on "Join a friend" with it filled in */
    join?: string | null;
    /** one line under the start screen, e.g. how finished games are kept */
    notice?: string | null;
    /** the bot the start screen opens on (default the first) */
    bot?: string | null;
}

/** What the start screen asks the table for when the person wants to play a person. */
export type PairRequest =
    /** find a person; with botAfterMs, the table starts a bot game if nobody comes in that time */
    | { how: 'lobby'; deck: string; botAfterMs: number | null }
    /** a link and a short code through the lobby */
    | { how: 'invite'; deck: string }
    /** a lobby link/code or a pasted direct code: the table tells them apart */
    | { how: 'join'; deck: string; code: string }
    /** a code to paste to a friend, no lobby */
    | { how: 'direct'; deck: string };

/** Where a pairing is now, as the table reports it (each report replaces the last). */
export interface PairState {
    /** what is happening now, one line */
    text: string;
    /** a code to copy and send (invite code, direct offer code, or the direct answer code to send back) */
    code?: string | null;
    /** a link to copy (lobby invite) */
    link?: string | null;
    /** when set, a field with this label where the host pastes the friend's answer code, and a Connect button (answer) */
    askCode?: string | null;
}

/** A pairing in progress: done resolves when the game starts (the person's seat, the opponent's name) or rejects with why not. */
export interface Pairing {
    done: Promise<{ id: string; seat: Seat; opponent: string }>;
    cancel(): void;
    answer?(code: string): void;
}

export interface Table {
    options(): Promise<TableOptions>;
    start(bot: string, deck: string, botDeck: string): Promise<{ id: string; seat: Seat }>;
    /**
     * Start fetching what a game with this bot needs while the person chooses, and report it (the first report soon);
     * the returned function stops the reports, and may stop the bot's own downloads. start() still waits for them.
     */
    prepare?(bot: string, onPrep: (p: Prep) => void): () => void;
    /** add a deck from a SWUDB link or a pasted list; the returned deck is also listed by later options() calls */
    importDeck?(text: string): Promise<DeckOption>;
    /** find a person to play (the modes in options().people); the game then plays through act, follow and concede as usual */
    pair?(req: PairRequest, onState: (s: PairState) => void): Pairing;
    /** rejects with the table's reason when it refuses the answer (the decision stays open) */
    act(id: string, act: Act): Promise<unknown>;
    concede(id: string): Promise<unknown>;
    /** every message of the game once, in order, until the returned function is called */
    follow(id: string, onMsg: (m: TableMsg) => void, onError: (down: boolean) => void): () => void;
    /** a link to download the finished game's replay, or null */
    replayUrl(id: string): string | null;
    /** "Watch the replay": a link, a function the host runs, or null for no button */
    watch(id: string): string | (() => void) | null;
    /** a game named in the address can be picked up again after a reload (the HTTP table keeps playing it) */
    resumable: boolean;
    /** the start screen's line under the title, when the host has its own */
    note?: string;
    /** what to say when the table cannot be reached */
    missing?: string;
}

const base = () => `${(hashParam('table') ?? '').replace(/\/+$/, '')}/table/api`;

async function call<T>(path: string, body?: unknown): Promise<T> {
    const r = await fetch(`${base()}${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const out = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    if (!r.ok) {
        throw new Error(out.error ?? `HTTP ${r.status}`);
    }
    return out as T;
}

export const httpTable: Table = {
    options: () => call<TableOptions>('/options'),
    start: (bot, deck, botDeck) => call<{ id: string; seat: Seat }>('/games', { bot, deck, botDeck }),
    act: (id, act) => call<{ ok: true }>(`/games/${encodeURIComponent(id)}/act`, act),
    concede: (id) => call<{ ok: true }>(`/games/${encodeURIComponent(id)}/concede`, {}),
    replayUrl: (id) => `${base()}/games/${encodeURIComponent(id)}/replay.jsonl`,
    watch: (id) => `#/t/table/g/${encodeURIComponent(id)}`,
    resumable: true,
    missing: 'Start one with node bot/table/serve.js in the arena repo.',
    /** EventSource reconnects and resumes after the last message it got */
    follow(id, onMsg, onError) {
        const es = new EventSource(`${base()}/games/${encodeURIComponent(id)}/events`);
        es.onmessage = (e) => {
            onError(false);
            onMsg(JSON.parse(e.data) as TableMsg);
        };
        es.onerror = () => onError(es.readyState !== EventSource.OPEN);
        return () => es.close();
    }
};

export const TableContext = createContext<Table>(httpTable);
