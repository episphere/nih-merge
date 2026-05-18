import * as d3 from 'd3';
import { dataManager } from '../../data/dataManager';
import type { CountyFilters, CountyRow, PopulationFilters, PopulationRow } from '../../data/types';
import type { Card, CardState, MapsMeasure, MapsState } from './state';
import { buildTrimmedColorScheme, sampleInterpolator } from './trimmedScheme';

// --- GeoJSON types ---

export interface GeoFeature {
  type: 'Feature';
  id: string;
  properties: { name: string };
  geometry: unknown;
}

export interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

export interface GeoData {
  stateGeoJSON: GeoFeatureCollection;
  countyGeoJSON: GeoFeatureCollection;
  nationGeoJSON: GeoFeatureCollection;
}

// --- Color config ---

export interface ColorConfig {
  scheme: string;
  reverse: boolean;
  domain: [number, number];
  pivot: number | null;
  valid: boolean;
  trimmedScheme: string[] | null;
  lowOutlierColor: string | null;
  highOutlierColor: string | null;
}

// --- GeoJSON loading (cached) ---

let geoDataPromise: Promise<GeoData> | null = null;

export function loadGeoJSON(): Promise<GeoData> {
  if (!geoDataPromise) {
    geoDataPromise = Promise.all([
      d3.json(new URL('../../data/geography/states.geojson', import.meta.url).href) as Promise<GeoFeatureCollection>,
      d3.json(new URL('../../data/geography/counties.geojson', import.meta.url).href) as Promise<GeoFeatureCollection>,
      d3.json(new URL('../../data/geography/nation.geojson', import.meta.url).href) as Promise<GeoFeatureCollection>,
    ]).then(([stateGeoJSON, countyGeoJSON, nationGeoJSON]) => ({
      stateGeoJSON,
      countyGeoJSON,
      nationGeoJSON,
    }));
  }
  return geoDataPromise;
}

// --- Per-card data fetching ---

const dataCache = new Map<string, Promise<Record<string, unknown>[]>>();

function cardQueryKey(cardState: CardState, measure: MapsMeasure): string {
  return [
    cardState.year,
    cardState.cause,
    cardState.sex,
    cardState.race,
    cardState.stateFips,
    cardState.spatialLevel,
    measure,
  ].join('\0');
}

export async function fetchCardData(
  cardState: CardState,
  measure: MapsMeasure,
): Promise<Record<string, unknown>[]> {
  const key = cardQueryKey(cardState, measure);
  let pending = dataCache.get(key);
  if (pending) return pending;

  pending = doFetch(cardState, measure);
  dataCache.set(key, pending);
  pending.catch(() => dataCache.delete(key));
  return pending;
}

async function doFetch(
  cardState: CardState,
  measure: MapsMeasure,
): Promise<Record<string, unknown>[]> {
  if (measure === 'population') {
    const filters: PopulationFilters = {
      year: cardState.year,
      race: cardState.race === 'All' ? 'All' : cardState.race,
      sex: cardState.sex === 'All' ? 'All' : cardState.sex,
      stateFips: cardState.stateFips === 'All' ? '*' : cardState.stateFips,
      countyFips: cardState.spatialLevel === 'state' ? 'All' : '*',
      ageGroup: 'All',
    };
    const rows = await dataManager.populationDomain.query(filters);
    return enrichRows(rows, cardState.spatialLevel);
  }

  const filters: CountyFilters = {
    year: cardState.year,
    cause: cardState.cause === 'All' ? 'All' : cardState.cause,
    race: cardState.race === 'All' ? 'All' : cardState.race,
    sex: cardState.sex === 'All' ? 'All' : cardState.sex,
    stateFips: cardState.stateFips === 'All' ? '*' : cardState.stateFips,
    countyFips: cardState.spatialLevel === 'state' ? 'All' : '*',
  };
  const rows = await dataManager.countyDomain.query(filters);
  return enrichRows(rows, cardState.spatialLevel);
}

async function enrichRows(
  rows: (CountyRow | PopulationRow)[],
  spatialLevel: 'county' | 'state',
): Promise<Record<string, unknown>[]> {
  const geo = await loadGeoJSON();
  const nameMap = new Map<string, string>();

  if (spatialLevel === 'county') {
    for (const f of geo.countyGeoJSON.features) {
      nameMap.set(f.id, f.properties.name);
    }
  } else {
    for (const f of geo.stateGeoJSON.features) {
      nameMap.set(f.id, f.properties.name);
    }
  }

  const fipsField = spatialLevel === 'county' ? 'countyFips' : 'stateFips';
  return rows.map((row) => {
    const r = row as unknown as Record<string, unknown>;
    return {
      ...r,
      regionName: nameMap.get(r[fipsField] as string) ?? 'Unknown',
    };
  });
}

// --- Fetch all card data ---

export async function fetchAllCardData(
  cards: Card[],
  measure: MapsMeasure,
): Promise<Map<number, Record<string, unknown>[]>> {
  const result = new Map<number, Record<string, unknown>[]>();
  const promises: Promise<void>[] = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (card.blank || !card.state) continue;
    const idx = i;
    promises.push(
      fetchCardData(card.state, measure).then((data) => {
        result.set(idx, data);
      }),
    );
  }

  await Promise.all(promises);
  return result;
}

// --- Color config computation ---

export function computeColorConfig(
  cardDataMap: Map<number, Record<string, unknown>[]>,
  state: MapsState,
): ColorConfig | null {
  const allValues: number[] = [];
  for (const data of cardDataMap.values()) {
    for (const row of data) {
      const val = row[state.measure] as number | null | undefined;
      if (val != null && Number.isFinite(val)) {
        if (!state.showZeroValues && val === 0) continue;
        allValues.push(val);
      }
    }
  }

  if (allValues.length === 0) {
    return null;
  }

  const mean = d3.mean(allValues)!;
  const extent = d3.extent(allValues) as [number, number];

  let domain: [number, number] = extent;
  let pivot: number | null = null;

  if (state.colorCenterMean) {
    pivot = mean;
  }

  if (state.colorExcludeExtremes && allValues.length > 1) {
    // Quantile-based clipping: cutoff is the percentage to clip from each
    // tail.  This is robust to skewed / zero-inflated distributions where
    // mean ± k·σ collapses.
    const tailFraction = state.colorExtremeCutoff / 100;
    const sorted = Float64Array.from(allValues).sort();
    const lo = d3.quantile(sorted, tailFraction)!;
    const hi = d3.quantile(sorted, 1 - tailFraction)!;
    domain = [
      Math.max(extent[0], lo),
      Math.min(extent[1], hi),
    ];
  }

  const valid = Number.isFinite(mean) && domain.every((d) => Number.isFinite(d));

  // Build trimmed color scheme when excluding extremes
  let trimmedScheme: string[] | null = null;
  let lowOutlierColor: string | null = null;
  let highOutlierColor: string | null = null;

  if (state.colorExcludeExtremes && valid) {
    try {
      const sampled = sampleInterpolator(state.colorScheme, 16);
      const trimResult = buildTrimmedColorScheme(sampled, 0.1, 0.1);
      trimmedScheme = trimResult.scheme;
      if (state.colorReverse) {
        lowOutlierColor = trimResult.rightOutlier;
        highOutlierColor = trimResult.leftOutlier;
      } else {
        lowOutlierColor = trimResult.leftOutlier;
        highOutlierColor = trimResult.rightOutlier;
      }
    } catch {
      // Fall back to no trimming if colorjs.io fails
    }
  }

  return {
    scheme: state.colorScheme,
    reverse: state.colorReverse,
    domain,
    pivot,
    valid,
    trimmedScheme,
    lowOutlierColor,
    highOutlierColor,
  };
}
