import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { approximateScaleDenominator, selectDetailTier } from './detailTier';
import type { GeoFeatureCollection } from './query';

function loadLowCounties(): GeoFeatureCollection {
  const path = new URL('../../data/geography/topology/low.topojson', import.meta.url);
  const topology = JSON.parse(readFileSync(path, 'utf8')) as Topology;
  return feature(
    topology,
    topology.objects.counties as GeometryCollection,
  ) as unknown as GeoFeatureCollection;
}

function stateDomain(counties: GeoFeatureCollection, stateFips: string): GeoFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: counties.features.filter((item) => item.id.startsWith(stateFips)),
  };
}

describe('adaptive map detail selection', () => {
  const counties = loadLowCounties();

  it('keeps normal whole-US cards on low detail', () => {
    expect(selectDetailTier(counties, 1200, 700, true)).toBe('low');
    expect(selectDetailTier(counties, 300, 200, true)).toBe('low');
  });

  it('uses high detail for a large Rhode Island card', () => {
    const rhodeIsland = stateDomain(counties, '44');
    expect(selectDetailTier(rhodeIsland, 1200, 700, false)).toBe('high');
  });

  it('accounts for both card and geographic size', () => {
    const rhodeIsland = stateDomain(counties, '44');
    const california = stateDomain(counties, '06');
    expect(selectDetailTier(rhodeIsland, 300, 200, false)).toBe('medium');
    expect(selectDetailTier(california, 1200, 700, false)).toBe('medium');
    expect(selectDetailTier(california, 600, 350, false)).toBe('low');
  });

  it('uses the documented map-scale cutoffs and handles empty space', () => {
    const rhodeIsland = stateDomain(counties, '44');
    expect(approximateScaleDenominator(rhodeIsland, 0, 700)).toBe(Infinity);
    expect(selectDetailTier(rhodeIsland, 0, 700, false)).toBe('low');
  });
});
