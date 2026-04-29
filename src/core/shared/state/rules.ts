import type { CancerSite, Sex } from '../../../data/types';

const FEMALE_ONLY_CANCERS: CancerSite[] = ['Cervix Uteri', 'Corpus and Uterus', 'Ovary'];

// --- State shape contracts ---

interface CauseSexState {
  cause: CancerSite | 'All';
  sex: Sex | 'All';
  sexOptions: (Sex | 'All')[];
}

interface ComparisonState {
  disabledFilters: string[];
  [key: string]: unknown;
}

/**
 * Cancer-Sex constraint: sex-specific cancers force the sex filter.
 * Breast defaults sex to Female when first selected.
 * Applies to all dashboards.
 */
export function causeSexRule(state: CauseSexState, prev: CauseSexState): void {
  if (state.cause === 'Prostate') {
    state.sexOptions = ['Male'];
    state.sex = 'Male';
  } else if (FEMALE_ONLY_CANCERS.includes(state.cause as CancerSite)) {
    state.sexOptions = ['Female'];
    state.sex = 'Female';
  } else if (state.cause === 'Breast') {
    state.sexOptions = ['All', 'Male', 'Female'];
    if (prev.cause !== 'Breast') {
      state.sex = 'Female';
    }
  } else {
    state.sexOptions = ['All', 'Male', 'Female'];
  }
}

/**
 * Comparison mutual exclusion: two comparison dimensions can't be the same non-"none" value.
 * If comp1 matches comp2, comp2 resets to "none".
 * Applies to Demographics & Characteristics.
 */
export function comparisonMutualExclusionRule<T extends Record<string, unknown>>(
  state: T,
  _prev: T,
  comp1Key: string,
  comp2Key: string,
): void {
  if (state[comp1Key] !== 'none' && state[comp1Key] === state[comp2Key]) {
    (state as Record<string, unknown>)[comp2Key] = 'none';
  }
}

/**
 * Comparison disables filter: when a field is used as a comparison dimension,
 * its corresponding filter is forced to "All" and marked as disabled.
 * Applies to Demographics & Characteristics.
 */
export function comparisonDisablesFilterRule<T extends ComparisonState>(
  state: T,
  _prev: T,
  compKeys: string[],
): void {
  state.disabledFilters = [];
  for (const key of compKeys) {
    const field = state[key] as string;
    if (field !== 'none' && field in state) {
      (state as Record<string, unknown>)[field] = 'All';
      state.disabledFilters.push(field);
    }
  }
}
