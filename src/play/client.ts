/**
 * The table's HTTP API (the arena's bot/table/serve.js): options, start a game, follow it as server-sent events,
 * answer decisions, concede. The table lives at the page's own origin under /table/api, or at `?table=<url>` in the
 * hash route.
 */
import type { Act, TableMsg } from './protocol';
import { hashParam } from '../lib/route';

export interface DeckOption { name: string; leader: string; base: string; style: string | null }
export interface TableOptions { bots: string[]; decks: DeckOption[]; botDeck: string }

const base = () => `${(hashParam('table') ?? '').replace(/\/+$/, '')}/table/api`;

async function call<T>(path: string, body?: unknown): Promise<T> {
    const r = await fetch(`${base()}${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const out = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    if (!r.ok) {
        throw new Error(out.error ?? `HTTP ${r.status}`);
    }
    return out as T;
}

export const tableOptions = () => call<TableOptions>('/options');
export const startGame = (bot: string, deck: string, botDeck: string) => call<{ id: string; seat: 'p1' | 'p2' }>('/games', { bot, deck, botDeck });
export const sendAct = (id: string, act: Act) => call<{ ok: true }>(`/games/${encodeURIComponent(id)}/act`, act);
export const concede = (id: string) => call<{ ok: true }>(`/games/${encodeURIComponent(id)}/concede`, {});
export const replayUrl = (id: string) => `${base()}/games/${encodeURIComponent(id)}/replay.jsonl`;

/** Follow a game: every message once, in order (EventSource reconnects and resumes after the last one it got). */
export function follow(id: string, onMsg: (m: TableMsg) => void, onError: (down: boolean) => void): () => void {
    const es = new EventSource(`${base()}/games/${encodeURIComponent(id)}/events`);
    es.onmessage = (e) => {
        onError(false);
        onMsg(JSON.parse(e.data) as TableMsg);
    };
    es.onerror = () => onError(es.readyState !== EventSource.OPEN);
    return () => es.close();
}
