import type { Key } from './i18n';

// The first run in the editor: four cards, only the things the screen does not already say.
// Data lives here so the store knows how many steps there are without importing the ui.

export interface TourStep {
  sel: string[]; // what the card points at, first match wins
  place: 'above' | 'below' | 'left';
  title: Key;
  body: Key;
}

export const TOUR: TourStep[] = [
  {
    sel: ['.overview'],
    place: 'below',
    title: 'keep it or drop it',
    body: 'takes play one after another. [[enter]] keeps one, [[⌫]] drops it.',
  },
  {
    sel: ['nav.lanes'],
    place: 'below',
    title: 'lanes are your passes',
    body: 'as many rounds as you want: each one keeps fewer takes, until the last lane holds one per line. [[tab]] changes lane, [[,]] renames them.',
  },
  {
    sel: ['.script'],
    place: 'left',
    title: 'script [[t]] · transcribe [[w]]',
    body: 'paste your script, pick your character. transcribing is a pass of its own, on your gpu inside this page: it refines the cuts and files every take under its line. or file them by hand with [[l]]. it gets some wrong, so skim **junk** first.',
  },
  {
    sel: ['.script .lines', '.script .placeholder', '.script'],
    place: 'left',
    title: 'one line at a time [[g]]',
    body: 'hear every take of a line back to back and keep the best. [[shift ↑↓]] moves between lines.',
  },
];
