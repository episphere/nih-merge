import {
  ALL_CANCER_SITES, ALL_RACES, ALL_COUNTY_MEASURES,
  type CancerSite, type Race, type Sex, type CountyMeasure,
} from '../../data/types';
import { causeSexRule, comparisonMutualExclusionRule, comparisonDisablesFilterRule } from '../shared/state/rules';

// --- Determinants-specific types ---

export type DeterminantsMeasure =
  | 'ageAdjustedRate'
  | 'crudeRate'
  | 'ageAdjustedRateRatioRefLow'
  | 'ageAdjustedRateRatioRefHigh'
  | 'crudeRateRatioRefLow'
  | 'crudeRateRatioRefHigh';

export type ComparisonField = 'race' | 'sex';

export interface DeterminantsState {
  // Filters
  cause: CancerSite | 'Total';
  race: Race | 'Total';
  sex: Sex | 'Total';

  // Quantile config
  quantileField: CountyMeasure;
  quantileNumber: '3' | '4' | '5' | '10';

  // Comparison axes
  compareColor: ComparisonField | 'none';
  compareFacet: ComparisonField | 'none';

  // Measure
  measure: DeterminantsMeasure;

  // Display settings
  showCI: boolean;
  showLines: boolean;
  startZero: boolean;

  // Plot filters
  compareColorFilter: Set<string> | null;
  compareFacetFilter: Set<string> | null;
  compareColorFilterOptions: string[];
  compareFacetFilterOptions: string[];

  // Dropdown options
  causeOptions: (CancerSite | 'Total')[];
  raceOptions: (Race | 'Total')[];
  sexOptions: (Sex | 'Total')[];
  quantileFieldOptions: CountyMeasure[];
  quantileNumberOptions: string[];
  measureOptions: DeterminantsMeasure[];
  compareColorOptions: (ComparisonField | 'none')[];
  compareFacetOptions: (ComparisonField | 'none')[];

  // Disabled filters
  disabledFilters: string[];
}

// --- Constants ---

const ALL_COMPARISON_FIELDS: (ComparisonField | 'none')[] = ['none', 'race', 'sex'];

const ALL_MEASURES: DeterminantsMeasure[] = [
  'ageAdjustedRate',
  'crudeRate',
  'ageAdjustedRateRatioRefLow',
  'ageAdjustedRateRatioRefHigh',
  'crudeRateRatioRefLow',
  'crudeRateRatioRefHigh',
];

// --- Defaults ---

export const DETERMINANTS_DEFAULTS: DeterminantsState = {
  cause: 'Total',
  race: 'Total',
  sex: 'Total',

  quantileField: 'adult_smoking',
  quantileNumber: '4',

  compareColor: 'none',
  compareFacet: 'none',

  measure: 'ageAdjustedRate',

  showCI: false,
  showLines: true,
  startZero: false,

  compareColorFilter: null,
  compareFacetFilter: null,
  compareColorFilterOptions: [],
  compareFacetFilterOptions: [],

  causeOptions: ['Total', ...ALL_CANCER_SITES],
  raceOptions: ['Total', ...ALL_RACES],
  sexOptions: ['Total', 'Male', 'Female'],
  quantileFieldOptions: [...ALL_COUNTY_MEASURES],
  quantileNumberOptions: ['3', '4', '5', '10'],
  measureOptions: ALL_MEASURES,
  compareColorOptions: ALL_COMPARISON_FIELDS,
  compareFacetOptions: ALL_COMPARISON_FIELDS,

  disabledFilters: [],
};

// --- Determinants-only rules ---

/** Reset plot filters when the corresponding comparison field changes. */
function plotFilterResetRule(
  state: DeterminantsState,
  prev: DeterminantsState,
): void {
  if (state.compareColor !== prev.compareColor) {
    state.compareColorFilter = null;
    state.compareColorFilterOptions = [];
  }
  if (state.compareFacet !== prev.compareFacet) {
    state.compareFacetFilter = null;
    state.compareFacetFilterOptions = [];
  }
}

// --- Resolve ---

export function resolveDeterminants(state: DeterminantsState, change: Partial<DeterminantsState>): DeterminantsState {
  const next = { ...state, ...change };
  causeSexRule(next, state);
  comparisonMutualExclusionRule(next as never, state as never, 'compareColor', 'compareFacet');
  comparisonDisablesFilterRule(next as never, state as never, ['compareColor', 'compareFacet']);
  plotFilterResetRule(next, state);
  return next;
}
