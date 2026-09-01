import * as d3 from 'd3';
import type { GeographyTier } from '../../data-access/geography';
import type { GeoFeatureCollection } from './query';

const EARTH_RADIUS_METERS = 6_371_008.8;
const INCHES_PER_METER = 39.37007874015748;
const CSS_PIXELS_PER_INCH = 96;
const LOW_MEDIUM_CUTOFF = 10_000_000;
const MEDIUM_HIGH_CUTOFF = Math.sqrt(5_000_000 * 500_000);

export function approximateScaleDenominator(
  domain: GeoFeatureCollection,
  width: number,
  height: number,
): number {
  if (width <= 0 || height <= 0 || domain.features.length === 0) return Infinity;
  const projection = d3.geoAlbersUsa().fitSize(
    [width, height],
    domain as unknown as GeoJSON.FeatureCollection,
  );
  const projectionScale = projection.scale();
  if (!Number.isFinite(projectionScale) || projectionScale <= 0) return Infinity;
  return EARTH_RADIUS_METERS * INCHES_PER_METER * CSS_PIXELS_PER_INCH / projectionScale;
}

export function selectDetailTier(
  domain: GeoFeatureCollection,
  width: number,
  height: number,
  isNational: boolean,
): GeographyTier {
  const denominator = approximateScaleDenominator(domain, width, height);
  if (denominator >= LOW_MEDIUM_CUTOFF) return 'low';
  if (isNational || denominator >= MEDIUM_HIGH_CUTOFF) return 'medium';
  return 'high';
}
