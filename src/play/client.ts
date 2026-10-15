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
/** botDeck: the list the bot gets unless the person picks one, or 'random' (one picked by each game's seed) */
export interface TableOptions { bots: string[]; decks: DeckOption[]; botDeck: string }

export interface Table {
    options(): Promise<TableOptions>;
    start(bot: string, deck: string, botDeck: string): Promise<{ id: string; seat: Seat }>;
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
