import type { TableOptions } from './client';
import { botAbout, botLabel } from './modes';

/**
 * The start screen's opponent: the bot's name when the table has one, else a select. A table that gives `botInfo`
 * lists each bot by its title, rating and download size, with who made it and its note under the pick.
 */
export function OpponentPicker({ opts, bot, onBot }: { opts: TableOptions; bot: string; onBot: (bot: string) => void }) {
    const about = botAbout(opts.botInfo?.[bot]);
    return opts.bots.length === 1 ? (
        <div className="flex flex-col gap-1 max-w-sm">
            <span className="text-xs uppercase tracking-[0.12em] text-dim">Opponent</span>
            <span className="font-display font-semibold">{botLabel(opts.bots[0], opts.botInfo?.[opts.bots[0]])}</span>
            {about && <span className="text-xs text-dim">{about}</span>}
        </div>
    ) : (
        <div className="flex flex-col gap-2 max-w-sm">
            <label htmlFor="play-bot" className="text-xs uppercase tracking-[0.12em] text-dim">Opponent</label>
            <select id="play-bot" className="play-select" value={bot} onChange={(e) => onBot(e.target.value)}>
                {opts.bots.map((b) => <option key={b} value={b}>{botLabel(b, opts.botInfo?.[b])}</option>)}
            </select>
            {about && <span className="text-xs text-dim">{about}</span>}
        </div>
    );
}
