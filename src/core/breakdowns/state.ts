import {
  ALL_YEARS, ALL_CANCER_SITES, ALL_RACES, ALL_AGE_GROUPS,
  type Year, type CancerSite, type Race, type Sex, type AgeGroup,
} from '../../data/types';
import { ALL_STATE_FIPS } from '../shared/fips';
import { causeSexRule, comparisonMutualExclusionRule, comparisonDisablesFilterRule } from '../shared/state/rules';

// --- Breakdowns-specific types ---

export type Measure = 'crudeRate' | 'ageAdjustedRate';
export type ComparisonField = 'race' | 'sex' | 'ageGroup' | 'cause';

export interface BreakdownsState {
  // Filters
  year: Year;
  cause: CancerSite | 'Total';
  race: Race | 'Total';
  sex: Sex | 'Total';
  ageGroup: AgeGroup | 'Total';
  stateFips: string;
  measure: Measure;

  // Comparison axes
  compareBar: ComparisonField | 'none';
  compareFacet: ComparisonField | 'none';

  // Display
  showCI: boolean;

  // Plot filters — restrict which values appear on the bar/facet axes
  compareBarFilter: Set<string> | null;
  compareFacetFilter: Set<string> | null;
  compareBarFilterOptions: string[];
  compareFacetFilterOptions: string[];

  // Options for every dropdown
  yearOptions: Year[];
  causeOptions: (CancerSite | 'Total')[];
  raceOptions: (Race | 'Total')[];
  sexOptions: (Sex | 'Total')[];
  ageGroupOptions: (AgeGroup | 'Total')[];
  measureOptions: Measure[];
  compareBarOptions: (ComparisonField | 'none')[];
  compareFacetOptions: (ComparisonField | 'none')[];
  stateFipsOptions: string[];

  // Disabled filters (locked by comparison rules)
  disabledFilters: string[];
}

// --- Constants ---

const ALL_COMPARISON_FIELDS: (ComparisonField | 'none')[] = ['none', 'race', 'sex', 'ageGroup', 'cause'];

// --- Defaults ---

export const BREAKDOWNS_DEFAULTS: BreakdownsState = {
  year: '2018-2022',
  cause: 'Total',
  race: 'Total',
  sex: 'Total',
  ageGroup: 'Total',
  stateFips: 'Total',
  measure: 'ageAdjustedRate',
  compareBar: 'race',
  compareFacet: 'none',
  showCI: false,

  compareBarFilter: null,
  compareFacetFilter: null,
  compareBarFilterOptions: [],
  compareFacetFilterOptions: [],

  yearOptions: [...ALL_YEARS],
  causeOptions: ['Total', ...ALL_CANCER_SITES],
  raceOptions: ['Total', ...ALL_RACES],
  sexOptions: ['Total', 'Male', 'Female'],
  ageGroupOptions: ['Total', ...ALL_AGE_GROUPS],
  measureOptions: ['crudeRate', 'ageAdjustedRate'],
  compareBarOptions: ALL_COMPARISON_FIELDS,
  compareFacetOptions: ALL_COMPARISON_FIELDS,
  stateFipsOptions: ['Total', ...ALL_STATE_FIPS],

  disabledFilters: [],
};

// --- Breakdowns-only rules ---

function ageForcesCrudeRateRule(state: BreakdownsState): void {
  const comparingByAge = state.compareBar === 'ageGroup' || state.compareFacet === 'ageGroup';
  const filteringByAge = state.ageGroup !== 'Total';
  if (comparingByAge || filteringByAge) {
    state.measure = 'crudeRate';
    state.measureOptions = ['crudeRate'];
  } else {
    state.measureOptions = ['crudeRate', 'ageAdjustedRate'];
  }
}

/** Reset plot filters when the corresponding comparison field changes. */
function plotFilterResetRule(
  state: BreakdownsState,
  prev: BreakdownsState,
): void {
  if (state.compareBar !== prev.compareBar) {
    state.compareBarFilter = null;
    state.compareBarFilterOptions = [];
  }
  if (state.compareFacet !== prev.compareFacet) {
    state.compareFacetFilter = null;
    state.compareFacetFilterOptions = [];
  }
}

// --- Resolve ---

export function resolveBreakdowns(state: BreakdownsState, change: Partial<BreakdownsState>): BreakdownsState {
  const next = { ...state, ...change };
  causeSexRule(next, state);
  comparisonMutualExclusionRule(next as never, state as never, 'compareBar', 'compareFacet');
  comparisonDisablesFilterRule(next as never, state as never, ['compareBar', 'compareFacet']);
  ageForcesCrudeRateRule(next);
  plotFilterResetRule(next, state);
  return next;
}
