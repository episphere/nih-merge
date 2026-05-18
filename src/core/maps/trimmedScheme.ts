import Color from 'colorjs.io';
import * as d3 from 'd3';

export interface TrimmedSchemeResult {
  scheme: string[];
  leftOutlier: string;
  rightOutlier: string;
}

/**
 * Creates a trimmed color scheme with outlier colors using perceptual
 * interpolation in OKLab space.
 */
export function buildTrimmedColorScheme(
  colors: string[],
  pLow = 0,
  pHigh = 0,
  numStops: number | null = null,
): TrimmedSchemeResult {
  if (!Array.isArray(colors) || colors.length < 2) {
    throw new Error('Need at least 2 colors');
  }
  if (pLow < 0 || pHigh < 0 || pLow + pHigh >= 1) {
    throw new Error('pLow and pHigh must be non-negative and sum to less than 1');
  }

  const parsed = colors.map((c) => new Color(c).to('oklab'));

  const segmentLengths: number[] = [];
  for (let i = 0; i < parsed.length - 1; i++) {
    segmentLengths.push(parsed[i].deltaE(parsed[i + 1], 'OK'));
  }

  const cumulative = [0];
  for (const len of segmentLengths) {
    cumulative.push(cumulative[cumulative.length - 1] + len);
  }
  const totalLength = cumulative[cumulative.length - 1];

  const stopCount = numStops ?? Math.max(colors.length, 5);

  if (totalLength === 0) {
    return {
      scheme: Array(stopCount).fill(colors[0]),
      leftOutlier: colors[0],
      rightOutlier: colors[colors.length - 1],
    };
  }

  const sampleAt = (t: number): string => {
    const target = t * totalLength;
    let i = 0;
    while (i < segmentLengths.length - 1 && cumulative[i + 1] < target) i++;
    const segStart = cumulative[i];
    const segLen = segmentLengths[i];
    const localT = segLen === 0 ? 0 : (target - segStart) / segLen;
    return parsed[i]
      .range(parsed[i + 1], { space: 'oklab' })(localT)
      .to('srgb')
      .toString({ format: 'hex' });
  };

  const scheme: string[] = [];
  for (let i = 0; i < stopCount; i++) {
    const u = i / (stopCount - 1);
    const t = pLow + u * (1 - pLow - pHigh);
    scheme.push(sampleAt(t));
  }

  return {
    scheme,
    leftOutlier: colors[0],
    rightOutlier: colors[colors.length - 1],
  };
}

/**
 * Samples a D3 interpolator at `n` evenly-spaced points to produce an array
 * of color strings suitable for `buildTrimmedColorScheme`.
 */
export function sampleInterpolator(name: string, n: number): string[] {
  const interpolator = (d3 as Record<string, unknown>)[
    'interpolate' + name
  ] as ((t: number) => string) | undefined;
  if (!interpolator) {
    throw new Error(`Unknown D3 interpolator: ${name}`);
  }
  const colors: string[] = [];
  for (let i = 0; i < n; i++) {
    colors.push(interpolator(i / (n - 1)));
  }
  return colors;
}
