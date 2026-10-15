import { createContext } from 'react';

/**
 * Which cards on the board a person may click now (play mode). A card reads it by its id: 'pick' when clicking it is
 * a legal move, 'picked' when a multi-select prompt already holds it. Outside play mode there is no provider and every
 * card stays a plain, unclickable view.
 */
export interface Pick {
    state: (id: string) => 'pick' | 'picked' | null;
    pick: (id: string) => void;
}

export const PickContext = createContext<Pick | null>(null);
