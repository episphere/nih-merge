import {
  ALL_CANCER_SITES, ALL_RACES,
  type Year, type CancerSite, type Race, type Sex,
} from '../../data/types';
import { ALL_STATE_FIPS } from '../shared/fips';
import { causeSexRule } from '../shared/state/rules';

// --- Maps-specific types ---

export type MapsMeasure = 'ageAdjustedRate' | 'crudeRate' | 'deaths' | 'population';

export interface CardState {
  year: Year;
  cause: CancerSite | 'All';
  sex: Sex | 'All';
  race: Race | 'All';
  stateFips: string;
  spatialLevel: 'county' | 'state';
}

export interface Card {
  x: number;
  y: number;
  blank: boolean;
  state: CardState | null;
}

export interface MapsState {
  // Grid
  cards: Card[];
  nRows: number;
  nCols: number;

  // Shared plot settings
  measure: MapsMeasure;
  colorScheme: string;
  colorReverse: boolean;
  colorCenterMean: boolean;
  colorExcludeExtremes: boolean;
  colorExtremeCutoff: number;
  showZeroValues: boolean;
  showOutlineCounty: boolean;
  showOutlineState: boolean;
  showOutlineNation: boolean;

  // Card editor form state (transient)
  editingCardIndex: number | null;
  editYear: Year;
  editCause: CancerSite | 'All';
  editSex: Sex | 'All';
  editRace: Race | 'All';
  editStateFips: string;
  editSpatialLevel: 'county' | 'state';

  // Options (managed by resolver)
  editSexOptions: (Sex | 'All')[];
  editCauseOptions: (CancerSite | 'All')[];
  editRaceOptions: (Race | 'All')[];
  editStateFipsOptions: string[];
  editYearOptions: Year[];
  measureOptions: MapsMeasure[];
}

// --- Defaults ---

export const DEFAULT_CARD: CardState = {
  year: '2022',
  cause: 'All',
  sex: 'All',
  race: 'All',
  stateFips: 'All',
  spatialLevel: 'county',
};

function makeDefaultCards(): Card[] {
  return [
    { x: 1, y: 1, blank: false, state: { ...DEFAULT_CARD } },
  ];
}

export const MAPS_DEFAULTS: MapsState = {
  cards: makeDefaultCards(),
  nRows: 1,
  nCols: 1,

  measure: 'ageAdjustedRate',
  colorScheme: 'RdYlBu',
  colorReverse: true,
  colorCenterMean: true,
  colorExcludeExtremes: true,
  colorExtremeCutoff: 2,
  showZeroValues: true,
  showOutlineCounty: false,
  showOutlineState: true,
  showOutlineNation: true,

  editingCardIndex: null,
  editYear: '2022',
  editCause: 'All',
  editSex: 'All',
  editRace: 'All',
  editStateFips: 'All',
  editSpatialLevel: 'county',

  editSexOptions: ['All', 'Male', 'Female'],
  editCauseOptions: ['All', ...ALL_CANCER_SITES],
  editRaceOptions: ['All', ...ALL_RACES],
  editStateFipsOptions: ['All', ...ALL_STATE_FIPS],
  editYearOptions: ['2022'],
  measureOptions: ['ageAdjustedRate', 'crudeRate', 'deaths', 'population'],
};

// --- Maps-only rules ---

/** When measure is 'population', cause is irrelevant — force to Total. */
function populationHidesCauseRule(state: MapsState): void {
  if (state.measure === 'population') {
    state.editCause = 'All';
  }
}

/** Ensure cards array matches nRows * nCols, filling new positions with blank cards. */
function syncCardsToGrid(state: MapsState, prev: MapsState): void {
  if (state.nRows === prev.nRows && state.nCols === prev.nCols) return;

  const existing = new Map<string, Card>();
  for (const card of state.cards) {
    existing.set(`${card.x},${card.y}`, card);
  }

  const newCards: Card[] = [];
  for (let y = 1; y <= state.nRows; y++) {
    for (let x = 1; x <= state.nCols; x++) {
      const key = `${x},${y}`;
      const card = existing.get(key);
      if (card) {
        newCards.push(card);
      } else {
        newCards.push({ x, y, blank: true, state: null });
      }
    }
  }
  state.cards = newCards;
}

// --- Resolve ---

export function resolveMaps(state: MapsState, change: Partial<MapsState>): MapsState {
  const next = { ...state, ...change };

  // If cards array was directly updated (e.g., card state changed), use deep copy
  if (change.cards) {
    next.cards = change.cards.map(c => ({ ...c, state: c.state ? { ...c.state } : null }));
  }

  // Apply cancer-sex constraint to edit form fields.
  // causeSexRule expects `cause`/`sex`/`sexOptions` keys, so we use a proxy object.
  const editProxy = {
    cause: next.editCause,
    sex: next.editSex,
    sexOptions: next.editSexOptions,
  };
  const prevEditProxy = {
    cause: state.editCause,
    sex: state.editSex,
    sexOptions: state.editSexOptions,
  };
  causeSexRule(editProxy, prevEditProxy);
  next.editCause = editProxy.cause;
  next.editSex = editProxy.sex;
  next.editSexOptions = editProxy.sexOptions;

  populationHidesCauseRule(next);
  syncCardsToGrid(next, state);

  return next;
}
