import { createContext } from 'react';

/**
 * Which cards on the board a person may click now (play mode). A card reads it by its id: 'pick' when clicking it is
 * a legal move, 'picked' when a multi-select prompt already holds it. Outside play mode there is no provider and every
 * card stays a plain, unclickable view.
 */
export interface Pick {
    state: (id: string) => 'pick' | 'picked' | null;
    pick: (id: string) => void;
    /** the key that picks the card (play/keys.ts), drawn on it as a key cap; null draws none */
    keyOf?: (id: string) => string | null;
    /** false while a key may not pick yet (just after a new decision): Enter or Space on a focused card waits too */
    keyReady?: () => boolean;
}

export const PickContext = createContext<Pick | null>(null);
