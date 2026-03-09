import type { CountyMeasure } from '../../data/types';

export interface QuantileDetail {
  year: string;
  nQuantiles: string;
  field: string;
  quantileRanges: [number, number][];
  validCount: number;
  name: string;
  description: string;
  unit: string;
  group: string;
}

export type QuantileDetailsIndex = Map<string, QuantileDetail>;

let cached: QuantileDetailsIndex | null = null;

function indexKey(field: string, nQuantiles: string, year?: string): string {
  return `${field}|${nQuantiles}|${year ?? '2022'}`;
}

/**
 * Load quantile_details.json and build an indexed map.
 * Proportions are converted to percentages for display.
 */
export async function loadQuantileDetails(): Promise<QuantileDetailsIndex> {
  if (cached) return cached;

  const url = new URL('../../data/quantile_details.json', import.meta.url).href;
  const resp = await fetch(url);
  const data: QuantileDetail[] = await resp.json();

  const index: QuantileDetailsIndex = new Map();
  for (const entry of data) {
    const isProportion = entry.unit === 'Proportion';
    const detail: QuantileDetail = {
      ...entry,
      quantileRanges: entry.quantileRanges.map(([lo, hi]) =>
        isProportion
          ? [parseFloat((lo * 100).toPrecision(10)), parseFloat((hi * 100).toPrecision(10))]
          : [lo, hi],
      ),
      unit: isProportion ? '%' : entry.unit,
    };
    index.set(indexKey(entry.field, entry.nQuantiles, entry.year), detail);
  }

  cached = index;
  return index;
}

/**
 * Look up the quantile detail for a given field, quantile number, and year.
 * Falls back to year '2022' if the requested year is not found.
 */
export function getQuantileDetail(
  index: QuantileDetailsIndex,
  field: CountyMeasure,
  nQuantiles: string,
  year = '2022',
): QuantileDetail | undefined {
  return index.get(indexKey(field, nQuantiles, year));
}

/**
 * Build a mapping from field name to group label using the loaded index.
 * Uses the first entry found for each field.
 */
export function buildFieldGroupMap(index: QuantileDetailsIndex): Map<string, string> {
  const map = new Map<string, string>();
  for (const detail of index.values()) {
    if (!map.has(detail.field)) {
      map.set(detail.field, detail.group);
    }
  }
  return map;
}

/**
 * Format a quantile range as a tick label string, e.g. "10.5 – 20.3".
 */
export function formatQuantileRange(range: [number, number], unit: string): string {
  const decimals = (v: number): number => {
    if (v === 0 || v % 1 === 0) return 0;
    const s = Math.abs(v).toString();
    const dot = s.indexOf('.');
    return dot === -1 ? 0 : s.length - dot - 1;
  };

  // Use enough decimals so both values are distinguishable, minimum 0
  const precision = Math.max(decimals(range[0]), decimals(range[1]));

  const useExp = precision > 3 || Math.abs(range[0]) >= 10_000 || Math.abs(range[1]) >= 10_000;

  const fmt = (v: number) => {
    if (useExp) return v.toExponential(2);
    if (unit === '%') return `${v.toFixed(Math.max(precision, 1))}%`;
    return precision === 0 ? String(v) : v.toFixed(precision);
  };
  return `${fmt(range[0])} – ${fmt(range[1])}`;
}
