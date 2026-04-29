import {
  ALL_CANCER_SITES, ALL_RACES, ALL_AGE_GROUPS,
  type Year, type CancerSite, type Race, type Sex, type AgeGroup,
} from '../../data/types';
import { ALL_STATE_FIPS } from '../shared/fips';
import { causeSexRule, comparisonMutualExclusionRule, comparisonDisablesFilterRule } from '../shared/state/rules';

// --- Demographics-specific types ---

export type Measure = 'crudeRate' | 'ageAdjustedRate';
export type ComparisonField = 'race' | 'sex' | 'ageGroup' | 'cause';

export interface DemographicsState {
  // Filters
  year: Year;
  cause: CancerSite | 'All';
  race: Race | 'All';
  sex: Sex | 'All';
  ageGroup: AgeGroup | 'All';
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
  causeOptions: (CancerSite | 'All')[];
  raceOptions: (Race | 'All')[];
  sexOptions: (Sex | 'All')[];
  ageGroupOptions: (AgeGroup | 'All')[];
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

export const DEMOGRAPHICS_DEFAULTS: DemographicsState = {
  year: '2022',
  cause: 'All',
  race: 'All',
  sex: 'All',
  ageGroup: 'All',
  stateFips: 'All',
  measure: 'ageAdjustedRate',
  compareBar: 'race',
  compareFacet: 'none',
  showCI: false,

  compareBarFilter: null,
  compareFacetFilter: null,
  compareBarFilterOptions: [],
  compareFacetFilterOptions: [],

  yearOptions: ['2022'],
  causeOptions: ['All', ...ALL_CANCER_SITES],
  raceOptions: ['All', ...ALL_RACES],
  sexOptions: ['All', 'Male', 'Female'],
  ageGroupOptions: ['All', ...ALL_AGE_GROUPS],
  measureOptions: ['crudeRate', 'ageAdjustedRate'],
  compareBarOptions: ALL_COMPARISON_FIELDS,
  compareFacetOptions: ALL_COMPARISON_FIELDS,
  stateFipsOptions: ['All', ...ALL_STATE_FIPS],

  disabledFilters: [],
};

// --- Demographics-only rules ---

function ageForcesCrudeRateRule(state: DemographicsState): void {
  const comparingByAge = state.compareBar === 'ageGroup' || state.compareFacet === 'ageGroup';
  const filteringByAge = state.ageGroup !== 'All';
  if (comparingByAge || filteringByAge) {
    state.measure = 'crudeRate';
    state.measureOptions = ['crudeRate'];
  } else {
    state.measureOptions = ['crudeRate', 'ageAdjustedRate'];
  }
}

/** Reset plot filters when the corresponding comparison field changes. */
function plotFilterResetRule(
  state: DemographicsState,
  prev: DemographicsState,
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

export function resolveDemographics(state: DemographicsState, change: Partial<DemographicsState>): DemographicsState {
  const next = { ...state, ...change };
  causeSexRule(next, state);
  comparisonMutualExclusionRule(next as never, state as never, 'compareBar', 'compareFacet');
  comparisonDisablesFilterRule(next as never, state as never, ['compareBar', 'compareFacet']);
  ageForcesCrudeRateRule(next);
  plotFilterResetRule(next, state);
  return next;
}
