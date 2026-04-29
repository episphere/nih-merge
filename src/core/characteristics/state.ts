import {
  ALL_CANCER_SITES, ALL_RACES, ALL_FIELD_IDS,
  type CancerSite, type Race, type Sex, type FieldId, type Year,
} from '../../data/types';
import { causeSexRule, comparisonMutualExclusionRule, comparisonDisablesFilterRule } from '../shared/state/rules';

// --- Characteristics-specific types ---

export type CharacteristicsMeasure =
  | 'ageAdjustedRate'
  | 'crudeRate'
  | 'ageAdjustedRateRatioRefLow'
  | 'ageAdjustedRateRatioRefHigh'
  | 'crudeRateRatioRefLow'
  | 'crudeRateRatioRefHigh';

export type ComparisonField = 'race' | 'sex';

export interface CharacteristicsState {
  // Filters
  cause: CancerSite | 'All';
  race: Race | 'All';
  sex: Sex | 'All';

  // Quantile config
  quantileField: FieldId;
  quantileNumber: '3' | '4' | '5' | '10';

  // Mortality year (determines which quantile file to load)
  year: Year;

  // Comparison axes
  compareColor: ComparisonField | 'none';
  compareFacet: ComparisonField | 'none';

  // Measure
  measure: CharacteristicsMeasure;

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
  causeOptions: (CancerSite | 'All')[];
  raceOptions: (Race | 'All')[];
  sexOptions: (Sex | 'All')[];
  quantileFieldOptions: FieldId[];
  quantileNumberOptions: string[];
  yearOptions: Year[];
  measureOptions: CharacteristicsMeasure[];
  compareColorOptions: (ComparisonField | 'none')[];
  compareFacetOptions: (ComparisonField | 'none')[];

  // Disabled filters
  disabledFilters: string[];
}

// --- Constants ---

const ALL_COMPARISON_FIELDS: (ComparisonField | 'none')[] = ['none', 'race', 'sex'];

const ALL_MEASURES: CharacteristicsMeasure[] = [
  'ageAdjustedRate',
  'crudeRate',
  'ageAdjustedRateRatioRefLow',
  'ageAdjustedRateRatioRefHigh',
  'crudeRateRatioRefLow',
  'crudeRateRatioRefHigh',
];

// --- Defaults ---

export const CHARACTERISTICS_DEFAULTS: CharacteristicsState = {
  cause: 'All',
  race: 'All',
  sex: 'All',

  quantileField: 'v009',
  quantileNumber: '4',

  year: '2022',

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

  causeOptions: ['All', ...ALL_CANCER_SITES],
  raceOptions: ['All', ...ALL_RACES],
  sexOptions: ['All', 'Male', 'Female'],
  quantileFieldOptions: [...ALL_FIELD_IDS],
  quantileNumberOptions: ['3', '4', '5', '10'],
  yearOptions: ['2018', '2019', '2020', '2021', '2022'],
  measureOptions: ALL_MEASURES,
  compareColorOptions: ALL_COMPARISON_FIELDS,
  compareFacetOptions: ALL_COMPARISON_FIELDS,

  disabledFilters: [],
};

// --- Characteristics-only rules ---

/** Reset plot filters when the corresponding comparison field changes. */
function plotFilterResetRule(
  state: CharacteristicsState,
  prev: CharacteristicsState,
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

export function resolveCharacteristics(state: CharacteristicsState, change: Partial<CharacteristicsState>): CharacteristicsState {
  const next = { ...state, ...change };
  causeSexRule(next, state);
  comparisonMutualExclusionRule(next as never, state as never, 'compareColor', 'compareFacet');
  comparisonDisablesFilterRule(next as never, state as never, ['compareColor', 'compareFacet']);
  plotFilterResetRule(next, state);
  return next;
}
