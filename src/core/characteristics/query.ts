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
  ageAdjustedRateRatioRefLowCiLower: number;
  ageAdjustedRateRatioRefLowCiUpper: number;
  ageAdjustedRateRatioRefHighCiLower: number;
  ageAdjustedRateRatioRefHighCiUpper: number;
  crudeRateRatioRefLowCiLower: number;
  crudeRateRatioRefLowCiUpper: number;
  crudeRateRatioRefHighCiLower: number;
  crudeRateRatioRefHighCiUpper: number;
}


// --- Filter building ---

function dimensionFilter<T extends string>(
  stateValue: T | 'All',
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
    year: state.year,
    quantileType: state.quantileNumber,
    cause: dimensionFilter<CancerSite>(state.cause as CancerSite | 'All', 'cause', compareColor, compareFacet),
    race: dimensionFilter<Race>(state.race as Race | 'All', 'race', compareColor, compareFacet),
    sex: dimensionFilter<Sex>(state.sex as Sex | 'All', 'sex', compareColor, compareFacet),
    field_id: state.quantileField,
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
  enriched.ageAdjustedRateRatioRefLowCiLower = 0;
  enriched.ageAdjustedRateRatioRefLowCiUpper = 0;
  enriched.ageAdjustedRateRatioRefHighCiLower = 0;
  enriched.ageAdjustedRateRatioRefHighCiUpper = 0;
  enriched.crudeRateRatioRefLowCiLower = 0;
  enriched.crudeRateRatioRefLowCiUpper = 0;
  enriched.crudeRateRatioRefHighCiLower = 0;
  enriched.crudeRateRatioRefHighCiUpper = 0;
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

function parseQuantileIndex(q: string | number): number {
  return typeof q === 'number' ? q : parseInt(q, 10);
}

/**
 * Compute rate ratio CI using the delta method on the log scale.
 * For RR = R1/R0: SE(ln(RR)) = sqrt(1/D1 + 1/D0)
 * CI = exp(ln(RR) ± 1.96 * SE(ln(RR)))
 */
function ratioCI(rr: number, deathsNum: number, deathsRef: number): { lower: number; upper: number } {
  if (rr <= 0 || deathsNum <= 0 || deathsRef <= 0) {
    return { lower: 0, upper: 0 };
  }
  const seLnRR = Math.sqrt(1 / deathsNum + 1 / deathsRef);
  const lnRR = Math.log(rr);
  return {
    lower: Math.round(Math.exp(lnRR - 1.96 * seLnRR) * 100) / 100,
    upper: Math.round(Math.exp(lnRR + 1.96 * seLnRR) * 100) / 100,
  };
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
    group.sort((a, b) => parseQuantileIndex(a.quantile_bin) - parseQuantileIndex(b.quantile_bin));

    const lowest = group[0];
    const highest = group[group.length - 1];
    const lowestAA = lowest?.ageAdjustedRate ?? 0;
    const highestAA = highest?.ageAdjustedRate ?? 0;
    const lowestCrude = lowest?.crudeRate ?? 0;
    const highestCrude = highest?.crudeRate ?? 0;
    const lowestDeaths = lowest?.deaths ?? 0;
    const highestDeaths = highest?.deaths ?? 0;

    for (const row of group) {
      row.ageAdjustedRateRatioRefLow = lowestAA > 0 ? Math.round((row.ageAdjustedRate / lowestAA) * 100) / 100 : 0;
      row.ageAdjustedRateRatioRefHigh = highestAA > 0 ? Math.round((row.ageAdjustedRate / highestAA) * 100) / 100 : 0;
      row.crudeRateRatioRefLow = lowestCrude > 0 ? Math.round((row.crudeRate / lowestCrude) * 100) / 100 : 0;
      row.crudeRateRatioRefHigh = highestCrude > 0 ? Math.round((row.crudeRate / highestCrude) * 100) / 100 : 0;

      const aaRefLowCI = ratioCI(row.ageAdjustedRateRatioRefLow, row.deaths, lowestDeaths);
      row.ageAdjustedRateRatioRefLowCiLower = aaRefLowCI.lower;
      row.ageAdjustedRateRatioRefLowCiUpper = aaRefLowCI.upper;

      const aaRefHighCI = ratioCI(row.ageAdjustedRateRatioRefHigh, row.deaths, highestDeaths);
      row.ageAdjustedRateRatioRefHighCiLower = aaRefHighCI.lower;
      row.ageAdjustedRateRatioRefHighCiUpper = aaRefHighCI.upper;

      const crudeRefLowCI = ratioCI(row.crudeRateRatioRefLow, row.deaths, lowestDeaths);
      row.crudeRateRatioRefLowCiLower = crudeRefLowCI.lower;
      row.crudeRateRatioRefLowCiUpper = crudeRefLowCI.upper;

      const crudeRefHighCI = ratioCI(row.crudeRateRatioRefHigh, row.deaths, highestDeaths);
      row.crudeRateRatioRefHighCiLower = crudeRefHighCI.lower;
      row.crudeRateRatioRefHighCiUpper = crudeRefHighCI.upper;
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
