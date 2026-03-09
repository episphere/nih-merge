import { dataManager } from '../../data';
import type { QuantileRow, QuantileFilters, FilterValue, CancerSite, Race, Sex } from '../../data/types';
import type { CharacteristicsState, ComparisonField, CharacteristicsMeasure } from './state';

// --- Enriched row type ---

export interface EnrichedQuantileRow extends QuantileRow {
  crudeRateCiLower: number;
  crudeRateCiUpper: number;
  ageAdjustedRateCiLower: number;
  ageAdjustedRateCiUpper: number;
  ageAdjustedRateRatioRefLow: number;
  ageAdjustedRateRatioRefHigh: number;
  crudeRateRatioRefLow: number;
  crudeRateRatioRefHigh: number;
}


// --- Filter building ---

function dimensionFilter<T extends string>(
  stateValue: T | 'Total',
  dimension: string,
  compareColor: ComparisonField | 'none',
  compareFacet: ComparisonField | 'none',
): FilterValue<T> {
  if (dimension === compareColor || dimension === compareFacet) {
    return '*';
  }
  return stateValue as FilterValue<T>;
}

function buildFilters(state: CharacteristicsState): QuantileFilters {
  const { compareColor, compareFacet } = state;
  return {
    year: '2018-2022',
    quantileType: state.quantileNumber,
    cause: dimensionFilter<CancerSite>(state.cause as CancerSite | 'Total', 'cause', compareColor, compareFacet),
    race: dimensionFilter<Race>(state.race as Race | 'Total', 'race', compareColor, compareFacet),
    sex: dimensionFilter<Sex>(state.sex as Sex | 'Total', 'sex', compareColor, compareFacet),
    countyMeasure: state.quantileField,
  };
}

// --- Confidence intervals ---

function addConfidenceIntervals(row: QuantileRow): EnrichedQuantileRow {
  const enriched = row as EnrichedQuantileRow;
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
  // Rate ratios computed separately after grouping
  enriched.ageAdjustedRateRatioRefLow = 0;
  enriched.ageAdjustedRateRatioRefHigh = 0;
  enriched.crudeRateRatioRefLow = 0;
  enriched.crudeRateRatioRefHigh = 0;
  return enriched;
}

// --- Rate ratios ---

/**
 * Build a stratum key from the comparison axes.
 * Rows within the same stratum share the same color+facet values.
 */
function stratumKey(row: EnrichedQuantileRow, state: CharacteristicsState): string {
  const parts: string[] = [];
  if (state.compareColor !== 'none') {
    parts.push(row[state.compareColor as keyof EnrichedQuantileRow] as string);
  }
  if (state.compareFacet !== 'none') {
    parts.push(row[state.compareFacet as keyof EnrichedQuantileRow] as string);
  }
  return parts.join('|');
}

function parseQuantileIndex(q: string): number {
  return parseInt(q, 10);
}

export function addRateRatios(data: EnrichedQuantileRow[], state: CharacteristicsState): void {
  // Group by stratum
  const groups = new Map<string, EnrichedQuantileRow[]>();
  for (const row of data) {
    const key = stratumKey(row, state);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(row);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => parseQuantileIndex(a.quantile) - parseQuantileIndex(b.quantile));

    const lowestAA = group[0]?.ageAdjustedRate ?? 0;
    const highestAA = group[group.length - 1]?.ageAdjustedRate ?? 0;
    const lowestCrude = group[0]?.crudeRate ?? 0;
    const highestCrude = group[group.length - 1]?.crudeRate ?? 0;

    for (const row of group) {
      row.ageAdjustedRateRatioRefLow = lowestAA > 0 ? Math.round((row.ageAdjustedRate / lowestAA) * 100) / 100 : 0;
      row.ageAdjustedRateRatioRefHigh = highestAA > 0 ? Math.round((row.ageAdjustedRate / highestAA) * 100) / 100 : 0;
      row.crudeRateRatioRefLow = lowestCrude > 0 ? Math.round((row.crudeRate / lowestCrude) * 100) / 100 : 0;
      row.crudeRateRatioRefHigh = highestCrude > 0 ? Math.round((row.crudeRate / highestCrude) * 100) / 100 : 0;
    }
  }
}

// --- Public API ---

export async function fetchData(state: CharacteristicsState): Promise<EnrichedQuantileRow[]> {
  const filters = buildFilters(state);
  const rows = await dataManager.quantileDomain.query(filters);
  const enriched = rows.map(addConfidenceIntervals);
  addRateRatios(enriched, state);
  return enriched;
}

/**
 * Apply plot filters to already-fetched data.
 */
export function applyPlotFilters(state: CharacteristicsState, data: EnrichedQuantileRow[]): EnrichedQuantileRow[] {
  let result = data;

  if (state.compareColor !== 'none' && state.compareColorFilter !== null) {
    const field = state.compareColor as keyof EnrichedQuantileRow;
    const filter = state.compareColorFilter;
    result = result.filter(row => filter.has(row[field] as string));
  }

  if (state.compareFacet !== 'none' && state.compareFacetFilter !== null) {
    const field = state.compareFacet as keyof EnrichedQuantileRow;
    const filter = state.compareFacetFilter;
    result = result.filter(row => filter.has(row[field] as string));
  }

  return result;
}

/**
 * Derive filter options from query results.
 */
export function deriveFilterOptions(
  state: CharacteristicsState,
  data: EnrichedQuantileRow[],
): { compareColorFilterOptions: string[]; compareFacetFilterOptions: string[] } {
  const colorOpts = state.compareColor !== 'none'
    ? [...new Set(data.map(row => row[state.compareColor as keyof EnrichedQuantileRow] as string))].sort()
    : [];
  const facetOpts = state.compareFacet !== 'none'
    ? [...new Set(data.map(row => row[state.compareFacet as keyof EnrichedQuantileRow] as string))].sort()
    : [];
  return { compareColorFilterOptions: colorOpts, compareFacetFilterOptions: facetOpts };
}

/**
 * Get the y-field name for the current measure.
 */
export function measureField(measure: CharacteristicsMeasure): keyof EnrichedQuantileRow {
  return measure as keyof EnrichedQuantileRow;
}
