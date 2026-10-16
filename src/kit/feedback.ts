/**
 * What is on screen, for a host page's feedback box: the arena window's widget calls SWUViewer.feedbackContext() when a
 * person opens it, so a note about "this" can be read against the board they saw. Each mounted replay viewer and play
 * screen reports its game, step, prompt and board as plain data. No React here: the tests load this file alone.
 */
export type Report = () => Record<string, unknown> | null;

const reporters = new Set<Report>();

/** Report what this view shows, until the returned function is called. */
export function reportOnScreen(report: Report): () => void {
    reporters.add(report);
    return () => {
        reporters.delete(report);
    };
}

/** What every mounted view shows now; a view that fails to say is listed with its error. */
export function feedbackContext(): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    for (const report of reporters) {
        try {
            const r = report();
            if (r) {
                out.push(r);
            }
        } catch (e) {
            out.push({ kind: 'error', error: String((e as Error)?.message ?? e).slice(0, 200) });
        }
    }
    return out;
}
