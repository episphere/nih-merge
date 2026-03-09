import { dataManager } from '../../data';
import type { AgeRow, AgeFilters, FilterValue, CancerSite, Race, Sex, AgeGroup } from '../../data/types';
import type { DemographicsState, ComparisonField } from './state';

// --- Enriched row type (AgeRow + confidence intervals) ---

export interface EnrichedAgeRow extends AgeRow {
  crudeRateCiLower: number;
  crudeRateCiUpper: number;
  ageAdjustedRateCiLower: number;
  ageAdjustedRateCiUpper: number;
}

// --- Filter building ---

/**
 * For a given dimension, determine the filter value to send to the data manager:
 * - If the dimension is used as a comparison axis → "*" (get all non-Total values)
 * - Otherwise → use the current state value (either "Total" or a specific value)
 */
function dimensionFilter<T extends string>(
  stateValue: T | 'Total',
  dimension: string,
  compareBar: ComparisonField | 'none',
  compareFacet: ComparisonField | 'none',
): FilterValue<T> {
  if (dimension === compareBar || dimension === compareFacet) {
    return '*';
  }
  return stateValue as FilterValue<T>;
}

function buildFilters(state: DemographicsState): AgeFilters {
  const { compareBar, compareFacet } = state;
  return {
    year: state.year,
    cause: dimensionFilter<CancerSite>(state.cause as CancerSite | 'Total', 'cause', compareBar, compareFacet),
    race: dimensionFilter<Race>(state.race as Race | 'Total', 'race', compareBar, compareFacet),
    sex: dimensionFilter<Sex>(state.sex as Sex | 'Total', 'sex', compareBar, compareFacet),
    ageGroup: dimensionFilter<AgeGroup>(state.ageGroup as AgeGroup | 'Total', 'ageGroup', compareBar, compareFacet),
    stateFips: state.stateFips,
  };
}

// --- Confidence intervals ---

function addConfidenceIntervals(row: AgeRow): EnrichedAgeRow {
  const enriched = row as EnrichedAgeRow;
  const computeCI = (rate: number, deaths: number) => {
    const se = deaths > 0 ? rate / Math.sqrt(deaths) : 0;
    return {
      lower: Math.round((rate - 1.96 * se) * 100) / 100,
      upper: Math.round((rate + 1.96 * se) * 100) / 100,
    };
  };
  const crude = computeCI(row.crudeRate, row.deaths);
  enriched.crudeRateCiLower = crude.lower;
  enriched.crudeRateCiUpper = crude.upper;
  const aa = computeCI(row.ageAdjustedRate, row.deaths);
  enriched.ageAdjustedRateCiLower = aa.lower;
  enriched.ageAdjustedRateCiUpper = aa.upper;
  return enriched;
}

// --- Public API ---

export async function fetchData(state: DemographicsState): Promise<EnrichedAgeRow[]> {
  const filters = buildFilters(state);
  const rows = await dataManager.ageDomain.query(filters);
  return rows.map(addConfidenceIntervals);
}

/**
 * Apply plot filters (compareBarFilter / compareFacetFilter) to already-fetched data.
 * Returns the filtered subset. If a filter is null, all values pass.
 */
export function applyPlotFilters(state: DemographicsState, data: EnrichedAgeRow[]): EnrichedAgeRow[] {
  let result = data;

  if (state.compareBar !== 'none' && state.compareBarFilter !== null) {
    const field = state.compareBar as keyof EnrichedAgeRow;
    const filter = state.compareBarFilter;
    result = result.filter(row => filter.has(row[field] as string));
  }

  if (state.compareFacet !== 'none' && state.compareFacetFilter !== null) {
    const field = state.compareFacet as keyof EnrichedAgeRow;
    const filter = state.compareFacetFilter;
    result = result.filter(row => filter.has(row[field] as string));
  }

  return result;
}

/**
 * Derive the available filter options from the actual query results.
 * Returns the distinct values for each active comparison axis.
 */
export function deriveFilterOptions(
  state: DemographicsState,
  data: EnrichedAgeRow[],
): { compareBarFilterOptions: string[]; compareFacetFilterOptions: string[] } {
  const barOpts = state.compareBar !== 'none'
    ? [...new Set(data.map(row => row[state.compareBar as keyof EnrichedAgeRow] as string))].sort()
    : [];
  const facetOpts = state.compareFacet !== 'none'
    ? [...new Set(data.map(row => row[state.compareFacet as keyof EnrichedAgeRow] as string))].sort()
    : [];
  return { compareBarFilterOptions: barOpts, compareFacetFilterOptions: facetOpts };
}
