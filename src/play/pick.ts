import { createContext } from 'react';
import type { MoveIcon, MovePreview, PreviewChange } from './protocol';

/**
 * Which cards on the board a person may click now (play mode). A card reads it by its id: 'pick' when clicking it is
 * a legal move, 'picked' when a multi-select prompt already holds it. Outside play mode there is no provider and every
 * card stays a plain, unclickable view.
 */
export interface Pick {
    state: (id: string) => 'pick' | 'picked' | null;
    /** hold: a finger made the move (the card's move icon), so it waits a moment with Undo before it goes */
    pick: (id: string, hold?: boolean) => void;
    /** the key that picks the card (play/keys.ts), drawn on it as a key cap; null draws none */
    keyOf?: (id: string) => string | null;
    /** false while a key may not pick yet (just after a new decision): Enter or Space on a focused card waits too */
    keyReady?: () => boolean;
    /**
     * true when a tap on a touch screen picks the card at once (a split target: one more there, which the split panel
     * takes back); any other tap opens the card with its moves (Card's onFocus with touch), so a tap never plays by accident
     */
    instant?: (id: string) => boolean;
    /**
     * The move a card's icon makes on a touch screen ('add': one more on a split target), with its words; null draws
     * no icon. A tap on the icon makes the move, a tap on the rest of the card opens it to read.
     */
    move?: (id: string) => { icon: MoveIcon | 'add'; label: string } | null;
    /** the card whose move is waiting to go (a touch move's take-back): its icon counts down, and a tap on it is Undo */
    held?: string | null;
    undo?: () => void;
    /** the card's move would change nothing (Action.noEffect): it still glows, greyed, so it is played only on purpose */
    dud?: (id: string) => boolean;
    /** the card whose ability asks the question now (the prompt's title names it): it is marked on the board */
    asking?: string | null;
    /** what picking the card would do (Action.preview): its own change is marked on it, so the choices can be compared */
    preview?: (id: string) => MovePreview | null;
    /**
     * The result shown on the whole board now, by card id: the answer waiting to go (a touch move's take-back) or the
     * one under the pointer or the keys. Each changed card shows its change; a card that leaves play fades.
     */
    outcome?: Map<string, PreviewChange> | null;
}

export const PickContext = createContext<Pick | null>(null);
