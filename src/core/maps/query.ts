import * as d3 from 'd3';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { dataManager } from '../../data-access';
import {
  geographyNamesUrl,
  geographyTopologyUrl,
  type GeographyTier,
} from '../../data-access/geography';
import type { CountyFilters, CountyRow, PopulationFilters, PopulationRow } from '../../domain/mortality';
import type { Card, CardState, MapsMeasure, MapsState } from './state';
import { buildTrimmedColorScheme, sampleInterpolator } from './trimmedScheme';
import { getSchemeReverse } from './topControls';
import { calculateColorDomain } from './colorDomain';

// --- GeoJSON types ---

export interface GeoFeature {
  type: 'Feature';
  id: string;
  properties: { name?: string; state?: string };
  geometry: GeoJSON.Geometry;
}

export interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

export interface GeoData {
  tier: GeographyTier;
  stateGeoJSON: GeoFeatureCollection;
  countyGeoJSON: GeoFeatureCollection;
  nationGeoJSON: GeoFeatureCollection;
}

interface GeographyNames {
  states: Record<string, string>;
  counties: Record<string, string>;
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

// --- Adaptive TopoJSON loading (cached) ---

type GeographyObject = GeometryCollection<{ id?: string; name?: string; state?: string }>;

const geoDataPromises = new Map<string, Promise<GeoData>>();
const resolvedGeoData = new Map<string, GeoData>();
let geographyNamesPromise: Promise<GeographyNames> | null = null;

function geographyKey(tier: GeographyTier, stateFips?: string): string {
  return tier === 'high' ? `${tier}:${stateFips ?? ''}` : tier;
}

function normalizeFeatureCollection(value: unknown): GeoFeatureCollection {
  const collection = value as GeoJSON.FeatureCollection;
  return {
    type: 'FeatureCollection',
    features: collection.features.map((item) => ({
      type: 'Feature',
      id: String(item.id ?? item.properties?.id ?? ''),
      properties: (item.properties ?? {}) as GeoFeature['properties'],
      geometry: item.geometry,
    })),
  };
}

function decodeTopology(topology: Topology, tier: GeographyTier): GeoData {
  const countiesObject = topology.objects.counties as GeographyObject | undefined;
  const statesObject = topology.objects.states as GeographyObject | undefined;
  if (!countiesObject || !statesObject) {
    throw new Error('Geography topology is missing counties or states');
  }

  const countyGeoJSON = normalizeFeatureCollection(feature(topology, countiesObject));
  const stateGeoJSON = normalizeFeatureCollection(feature(topology, statesObject));
  const nationGeometry = mesh(topology, statesObject, (a, b) => a === b);
  const nationGeoJSON: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: 'nation',
      properties: {},
      geometry: nationGeometry,
    }],
  };

  return { tier, countyGeoJSON, stateGeoJSON, nationGeoJSON };
}

export function getCachedGeoData(tier: GeographyTier, stateFips?: string): GeoData | null {
  return resolvedGeoData.get(geographyKey(tier, stateFips)) ?? null;
}

export function loadGeoData(tier: GeographyTier, stateFips?: string): Promise<GeoData> {
  const key = geographyKey(tier, stateFips);
  const cached = resolvedGeoData.get(key);
  if (cached) return Promise.resolve(cached);

  let pending = geoDataPromises.get(key);
  if (pending) return pending;

  pending = d3.json(geographyTopologyUrl(tier, stateFips))
    .then((topology) => decodeTopology(topology as Topology, tier))
    .then((geoData) => {
      resolvedGeoData.set(key, geoData);
      return geoData;
    });
  geoDataPromises.set(key, pending);
  pending.catch(() => geoDataPromises.delete(key));
  return pending;
}

function loadGeographyNames(): Promise<GeographyNames> {
  if (!geographyNamesPromise) {
    geographyNamesPromise = d3.json(geographyNamesUrl()) as Promise<GeographyNames>;
    geographyNamesPromise.catch(() => {
      geographyNamesPromise = null;
    });
  }
  return geographyNamesPromise;
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
  const names = await loadGeographyNames();
  const nameMap = spatialLevel === 'county' ? names.counties : names.states;

  const fipsField = spatialLevel === 'county' ? 'countyFips' : 'stateFips';
  return rows.map((row) => {
    const r = row as unknown as Record<string, unknown>;
    return {
      ...r,
      regionName: nameMap[r[fipsField] as string] ?? 'Unknown',
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

  const extent = d3.extent(allValues) as [number, number];

  let domain: [number, number] = extent;

  const automaticDomain = state.colorExcludeExtremes
    ? calculateColorDomain(allValues, state)
    : null;
  if (automaticDomain) {
    domain = [automaticDomain.domainMin, automaticDomain.domainMax];
  }

  // Center the continuous scale on the retained distribution. An accepted
  // extreme must not pull the pivot back toward the range we just excluded.
  const retainedValues = allValues.filter((value) => value >= domain[0] && value <= domain[1]);
  const mean = d3.mean(retainedValues)!;
  const pivot = state.colorCenterMean ? mean : null;

  const valid = Number.isFinite(mean) && domain.every((d) => Number.isFinite(d));

  // XOR: if the scheme is auto-reversed, the user toggle flips it back
  const schemeReverse = getSchemeReverse(state.colorScheme);
  const effectiveReverse = schemeReverse !== state.colorReverse;

  // Build trimmed color scheme when excluding extremes
  let trimmedScheme: string[] | null = null;
  let lowOutlierColor: string | null = null;
  let highOutlierColor: string | null = null;

  const hasLowerExtremes = (automaticDomain?.lowerExtremes.length ?? 0) > 0;
  const hasUpperExtremes = (automaticDomain?.upperExtremes.length ?? 0) > 0;
  if (state.colorExcludeExtremes && valid && (hasLowerExtremes || hasUpperExtremes)) {
    try {
      const sampled = sampleInterpolator(state.colorScheme, 16);
      const trimResult = buildTrimmedColorScheme(
        sampled,
        hasLowerExtremes ? 0.1 : 0,
        hasUpperExtremes ? 0.1 : 0,
      );
      trimmedScheme = trimResult.scheme;
      const lowColor = effectiveReverse ? trimResult.rightOutlier : trimResult.leftOutlier;
      const highColor = effectiveReverse ? trimResult.leftOutlier : trimResult.rightOutlier;
      lowOutlierColor = hasLowerExtremes ? lowColor : null;
      highOutlierColor = hasUpperExtremes ? highColor : null;
    } catch {
      // Fall back to no trimming if colorjs.io fails
    }
  }

  return {
    scheme: state.colorScheme,
    reverse: effectiveReverse,
    domain,
    pivot,
    valid,
    trimmedScheme,
    lowOutlierColor,
    highOutlierColor,
  };
}
