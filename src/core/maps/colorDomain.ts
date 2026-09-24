import * as d3 from 'd3';

export type ExtremeValueSensitivity =
  | 'conservative'
  | 'balanced'
  | 'aggressive'
  | 'custom';

export interface ColorDomainConfig {
  extremeValueSensitivity: ExtremeValueSensitivity;
  gamma?: number;
}

export interface ColorDomainResult {
  domainMin: number;
  domainMax: number;
  lowerExtremes: number[];
  upperExtremes: number[];
}

export const MINIMUM_SAMPLE_SIZE = 20;
export const MAXIMUM_CANDIDATE_FRACTION = 0.05;

const SEPARATION_THRESHOLD = 3;
const MINIMUM_VISUAL_IMPACT = 0.2;
const LOCAL_GAP_COUNT = 10;
const MIN_POSITIVE_GAMMA = 0.01;
const MAX_GAMMA = 2;
const MAX_MEDCOUPLE_SAMPLE_SIZE = 2_000;

const GAMMA_BY_SENSITIVITY: Record<Exclude<ExtremeValueSensitivity, 'custom'>, number> = {
  conservative: 0.5,
  balanced: 1,
  aggressive: 1.5,
};

export function resolveGamma(config: ColorDomainConfig): number {
  if (config.extremeValueSensitivity !== 'custom') {
    return GAMMA_BY_SENSITIVITY[config.extremeValueSensitivity]
      ?? GAMMA_BY_SENSITIVITY.balanced;
  }
  const gamma = Number.isFinite(config.gamma) ? config.gamma! : GAMMA_BY_SENSITIVITY.balanced;
  if (gamma <= 0) return 0;
  return Math.max(MIN_POSITIVE_GAMMA, Math.min(MAX_GAMMA, gamma));
}

/** Acklam's rational approximation of the inverse standard-normal CDF. */
export function inverseNormalCDF(probability: number): number {
  if (probability <= 0) return -Infinity;
  if (probability >= 1) return Infinity;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1,
    2.445134137142996, 3.754408661907416,
  ];
  const lower = 0.02425;
  const upper = 1 - lower;

  if (probability < lower) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (probability <= upper) {
    const q = probability - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
      / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - probability));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
    / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function median(values: Float64Array): number {
  values.sort();
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}

/**
 * Computes the medcouple robust-skewness statistic. Very large inputs are
 * deterministically reduced to evenly spaced order statistics to keep this
 * quadratic statistic responsive when several national maps share a scale.
 */
export function medcouple(sortedValues: readonly number[]): number {
  if (sortedValues.length === 0) return 0;

  let values = sortedValues;
  if (values.length > MAX_MEDCOUPLE_SAMPLE_SIZE) {
    const sampled: number[] = [];
    for (let i = 0; i < MAX_MEDCOUPLE_SAMPLE_SIZE; i++) {
      const index = Math.round(i * (values.length - 1) / (MAX_MEDCOUPLE_SAMPLE_SIZE - 1));
      sampled.push(values[index]);
    }
    values = sampled;
  }

  const middle = Math.floor(values.length / 2);
  const center = values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
  const lower = values.filter((value) => value <= center);
  const upper = values.filter((value) => value >= center);
  const kernels = new Float64Array(lower.length * upper.length);
  let index = 0;

  for (const high of upper) {
    for (const low of lower) {
      const denominator = high - low;
      kernels[index++] = denominator === 0
        ? 0
        : (high + low - 2 * center) / denominator;
    }
  }
  return median(kernels);
}

function fullRange(values: readonly number[]): ColorDomainResult {
  return {
    domainMin: values[0],
    domainMax: values[values.length - 1],
    lowerExtremes: [],
    upperExtremes: [],
  };
}

function typicalGap(
  values: readonly number[],
  boundaryIndex: number,
  direction: -1 | 1,
): number | null {
  const local: number[] = [];
  let index = boundaryIndex;
  while (index >= 0 && index < values.length - 1 && local.length < LOCAL_GAP_COUNT) {
    const gap = values[index + 1] - values[index];
    if (gap > 0) local.push(gap);
    index += direction;
  }
  if (local.length > 0) return d3.median(local)!;

  // Duplicates can consume the entire local neighborhood. Search the retained
  // distribution for non-zero gaps before treating it as a single-value cluster.
  const wider: number[] = [];
  for (let i = 0; i < values.length - 1; i++) {
    const gap = values[i + 1] - values[i];
    if (gap > 0) wider.push(gap);
  }
  return wider.length > 0 ? d3.median(wider)! : null;
}

function passesTailTests(
  values: readonly number[],
  candidateCount: number,
  side: 'lower' | 'upper',
  minimumVisualImpact: number,
): boolean {
  if (candidateCount === 0 || candidateCount / values.length > MAXIMUM_CANDIDATE_FRACTION) {
    return false;
  }

  const retainedStart = side === 'lower' ? candidateCount : 0;
  const retainedEnd = side === 'upper' ? values.length - candidateCount - 1 : values.length - 1;
  if (retainedStart > retainedEnd) return false;

  const boundaryGap = side === 'lower'
    ? values[retainedStart] - values[retainedStart - 1]
    : values[retainedEnd + 1] - values[retainedEnd];
  const localGap = side === 'lower'
    ? typicalGap(values.slice(retainedStart, retainedEnd + 1), 0, 1)
    : typicalGap(values.slice(retainedStart, retainedEnd + 1), retainedEnd - retainedStart - 1, -1);
  const separated = localGap === null
    ? boundaryGap > 0
    : boundaryGap / localGap >= SEPARATION_THRESHOLD;
  if (!separated) return false;

  const retainedMin = values[retainedStart];
  const retainedMax = values[retainedEnd];
  const retainedRange = retainedMax - retainedMin;
  const excludedRange = side === 'lower'
    ? retainedMin - values[0]
    : values[values.length - 1] - retainedMax;
  const impact = retainedRange === 0
    ? (excludedRange > 0 ? Infinity : 0)
    : excludedRange / retainedRange;
  return impact >= Math.max(0, Math.min(1, minimumVisualImpact));
}

export function calculateColorDomain(
  input: readonly unknown[],
  config: ColorDomainConfig,
): ColorDomainResult | null {
  const values = input
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  if (values[0] === values[values.length - 1] || values.length < MINIMUM_SAMPLE_SIZE) {
    return fullRange(values);
  }

  const gamma = resolveGamma(config);
  // Zero is an explicit Custom off state. No finite positive gamma can
  // guarantee that arbitrarily distant observations fall inside the fences.
  if (gamma === 0) return fullRange(values);

  const q1 = d3.quantileSorted(values, 0.25)!;
  const q3 = d3.quantileSorted(values, 0.75)!;
  const iqr = q3 - q1;
  const k = inverseNormalCDF(1 - gamma / (2 * values.length)) / 1.35 - 0.5;
  const mc = medcouple(values);
  const lowerFence = mc >= 0
    ? q1 - k * Math.exp(-4 * mc) * iqr
    : q1 - k * Math.exp(-3 * mc) * iqr;
  const upperFence = mc >= 0
    ? q3 + k * Math.exp(3 * mc) * iqr
    : q3 + k * Math.exp(4 * mc) * iqr;

  let lowerCount = 0;
  while (lowerCount < values.length && values[lowerCount] < lowerFence) lowerCount++;
  let upperCount = 0;
  while (upperCount < values.length && values[values.length - 1 - upperCount] > upperFence) upperCount++;

  const acceptLower = passesTailTests(values, lowerCount, 'lower', MINIMUM_VISUAL_IMPACT);
  const acceptUpper = passesTailTests(values, upperCount, 'upper', MINIMUM_VISUAL_IMPACT);
  const lowerExtremes = acceptLower ? values.slice(0, lowerCount) : [];
  const upperExtremes = acceptUpper ? values.slice(values.length - upperCount) : [];
  const retainedStart = acceptLower ? lowerCount : 0;
  const retainedEnd = acceptUpper ? values.length - upperCount - 1 : values.length - 1;

  return {
    domainMin: values[retainedStart],
    domainMax: values[retainedEnd],
    lowerExtremes,
    upperExtremes,
  };
}
