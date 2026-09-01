import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

const geographyRoot = new URL('../../data/geography/', import.meta.url);

function readTopology(relativePath: string): Topology {
  return JSON.parse(readFileSync(new URL(relativePath, geographyRoot), 'utf8')) as Topology;
}

function geometries(topology: Topology, objectName: string) {
  return (topology.objects[objectName] as GeometryCollection).geometries;
}

function coordinateCount(topology: Topology, stateFips: string): number {
  const collection = feature(
    topology,
    topology.objects.counties as GeometryCollection,
  ) as GeoJSON.FeatureCollection;
  function count(value: unknown): number {
    if (!Array.isArray(value)) return 0;
    if (typeof value[0] === 'number') return 1;
    return value.reduce<number>((sum, child) => sum + count(child), 0);
  }
  return collection.features
    .filter((item) => String(item.id).startsWith(stateFips))
    .reduce((sum, item) => (
      sum + ('coordinates' in item.geometry ? count(item.geometry.coordinates) : 0)
    ), 0);
}

describe('generated map geography', () => {
  const low = readTopology('topology/low.topojson');
  const medium = readTopology('topology/medium.topojson');

  it('keeps the same supported FIPS entities in both national tiers', () => {
    const lowCounties = geometries(low, 'counties').map((item) => String(item.id)).sort();
    const mediumCounties = geometries(medium, 'counties').map((item) => String(item.id)).sort();
    const lowStates = geometries(low, 'states').map((item) => String(item.id)).sort();
    const mediumStates = geometries(medium, 'states').map((item) => String(item.id)).sort();

    expect(lowCounties).toHaveLength(3143);
    expect(lowStates).toHaveLength(51);
    expect(mediumCounties).toEqual(lowCounties);
    expect(mediumStates).toEqual(lowStates);
    expect(lowStates.every((id) => Number(id) <= 56)).toBe(true);
  });

  it('retains Connecticut legacy counties', () => {
    const connecticut = geometries(low, 'counties')
      .map((item) => String(item.id))
      .filter((id) => id.startsWith('09'))
      .sort();
    expect(connecticut).toEqual([
      '09001', '09003', '09005', '09007',
      '09009', '09011', '09013', '09015',
    ]);
  });

  it('increases boundary detail at each Rhode Island tier', () => {
    const high = readTopology('topology/high/44.topojson');
    expect(coordinateCount(medium, '44')).toBeGreaterThan(coordinateCount(low, '44'));
    expect(coordinateCount(high, '44')).toBeGreaterThan(coordinateCount(medium, '44'));
  });

  it('provides one complete high-detail shard for every supported state', () => {
    const highDirectory = new URL('topology/high/', geographyRoot);
    const files = readdirSync(highDirectory).filter((name) => name.endsWith('.topojson')).sort();
    const stateIds = geometries(low, 'states').map((item) => String(item.id)).sort();
    expect(files.map((name) => name.slice(0, 2))).toEqual(stateIds);

    for (const file of files) {
      const stateFips = file.slice(0, 2);
      const topology = readTopology(`topology/high/${file}`);
      expect(geometries(topology, 'states').map((item) => String(item.id))).toEqual([stateFips]);
      expect(
        geometries(topology, 'counties').every((item) => String(item.id).startsWith(stateFips)),
      ).toBe(true);
    }
  });

  it('provides names for every generated geography', () => {
    const names = JSON.parse(readFileSync(new URL('names.json', geographyRoot), 'utf8')) as {
      states: Record<string, string>;
      counties: Record<string, string>;
    };
    expect(Object.keys(names.states)).toHaveLength(51);
    expect(Object.keys(names.counties)).toHaveLength(3143);
  });
});
