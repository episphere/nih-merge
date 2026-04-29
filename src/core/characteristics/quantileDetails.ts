import type { FieldId } from '../../data/types';

// --- JSON structure from chr_quantile_details.json ---

interface QuantileBoundaries {
  n_quantiles: number;
  boundaries: [number, number][];
}

interface ChrQuantileEntry {
  chr_vintage: string;
  field_id: string;
  measure: string;
  category: string;
  data_years: string;
  source: string;
  proportion_valid: number;
  total_counties: number;
  valid_counties: number;
  quantiles: Record<string, QuantileBoundaries>;
}

// --- Public types ---

export interface QuantileDetail {
  chrVintage: string;
  fieldId: string;
  name: string;
  category: string;
  dataYears: string;
  source: string;
  proportionValid: number;
  totalCounties: number;
  validCounties: number;
  unit: string;
  nQuantiles: string;
  quantileRanges: [number, number][];
}

export type QuantileDetailsIndex = Map<string, QuantileDetail>;

// --- Caches ---

let cachedIndex: QuantileDetailsIndex | null = null;
const vintageCache = new Map<string, Promise<Record<string, string>>>();
const resolvedVintageCache = new Map<string, Record<string, string>>();

// --- Internal helpers ---

function indexKey(fieldId: string, nQuantiles: string, chrVintage: string): string {
  return `${fieldId}|${nQuantiles}|${chrVintage}`;
}

function detectUnit(entry: ChrQuantileEntry): string {
  // Heuristic: if all boundaries across all quantile types are 0-1 range, it's a proportion
  for (const qb of Object.values(entry.quantiles)) {
    for (const [lo, hi] of qb.boundaries) {
      if (lo > 1 || hi > 1 || lo < 0) return 'per unit';
    }
  }
  return 'Proportion';
}

function buildIndex(entries: ChrQuantileEntry[]): QuantileDetailsIndex {
  const index: QuantileDetailsIndex = new Map();
  for (const entry of entries) {
    const rawUnit = detectUnit(entry);
    const isProportion = rawUnit === 'Proportion';

    for (const [nQ, qb] of Object.entries(entry.quantiles)) {
      const detail: QuantileDetail = {
        chrVintage: entry.chr_vintage,
        fieldId: entry.field_id,
        name: entry.measure,
        category: entry.category,
        dataYears: entry.data_years,
        source: entry.source,
        proportionValid: entry.proportion_valid,
        totalCounties: entry.total_counties,
        validCounties: entry.valid_counties,
        unit: isProportion ? '%' : rawUnit,
        nQuantiles: nQ,
        quantileRanges: qb.boundaries.map(([lo, hi]) =>
          isProportion
            ? [parseFloat((lo * 100).toPrecision(10)), parseFloat((hi * 100).toPrecision(10))]
            : [lo, hi],
        ),
      };
      index.set(indexKey(entry.field_id, nQ, entry.chr_vintage), detail);
    }
  }
  return index;
}

// --- Vintage assignments loader ---

async function loadVintageAssignments(year: string): Promise<Record<string, string>> {
  const resolved = resolvedVintageCache.get(year);
  if (resolved) return resolved;

  let pending = vintageCache.get(year);
  if (!pending) {
    const url = new URL(`../../data/chr_vintage_assignments_${year}.json`, import.meta.url).href;
    pending = fetch(url).then(r => r.json());
    vintageCache.set(year, pending);
    pending.catch(() => vintageCache.delete(year));
  }
  const result = await pending;
  resolvedVintageCache.set(year, result);
  return result;
}

/**
 * Pre-load vintage assignments for a given year.
 * Call this at startup so synchronous lookups work.
 */
export async function preloadVintageAssignments(year: string): Promise<void> {
  await loadVintageAssignments(year);
}

/**
 * Synchronous lookup using pre-loaded vintage assignments.
 * Returns undefined if assignments haven't been loaded yet.
 */
export function getQuantileDetailForYear(
  index: QuantileDetailsIndex,
  fieldId: string,
  nQuantiles: string,
  mortalityYear: string,
): QuantileDetail | undefined {
  const assignments = resolvedVintageCache.get(mortalityYear);
  if (!assignments) return undefined;
  const chrVintage = assignments[fieldId];
  if (!chrVintage) return undefined;
  return index.get(indexKey(fieldId, nQuantiles, chrVintage));
}

// --- Public API ---

/**
 * Load chr_quantile_details.json and build an indexed map.
 * Proportions are converted to percentages for display.
 */
export async function loadQuantileDetails(): Promise<QuantileDetailsIndex> {
  if (cachedIndex) return cachedIndex;

  const url = new URL('../../data/chr_quantile_details.json', import.meta.url).href;
  const resp = await fetch(url);
  const data: ChrQuantileEntry[] = await resp.json();

  const index = buildIndex(data);
  cachedIndex = index;
  return index;
}

/**
 * Look up the quantile detail for a given field, quantile number, and mortality year.
 * Uses vintage assignments to determine the correct chr_vintage.
 */
export async function getQuantileDetail(
  index: QuantileDetailsIndex,
  fieldId: FieldId,
  nQuantiles: string,
  mortalityYear = '2022',
): Promise<QuantileDetail | undefined> {
  const assignments = await loadVintageAssignments(mortalityYear);
  const chrVintage = assignments[fieldId];
  if (!chrVintage) return undefined;
  return index.get(indexKey(fieldId, nQuantiles, chrVintage));
}

/**
 * Synchronous lookup when vintage is already known.
 */
export function getQuantileDetailSync(
  index: QuantileDetailsIndex,
  fieldId: string,
  nQuantiles: string,
  chrVintage: string,
): QuantileDetail | undefined {
  return index.get(indexKey(fieldId, nQuantiles, chrVintage));
}

/**
 * Build a mapping from field_id to category label using the loaded entries.
 * Uses the first entry found for each field.
 */
export function buildFieldGroupMap(index: QuantileDetailsIndex): Map<string, string> {
  const map = new Map<string, string>();
  for (const detail of index.values()) {
    if (!map.has(detail.fieldId)) {
      map.set(detail.fieldId, detail.category);
    }
  }
  return map;
}

/**
 * Build a mapping from field_id to display name (measure).
 */
export function buildFieldNameMap(index: QuantileDetailsIndex): Map<string, string> {
  const map = new Map<string, string>();
  for (const detail of index.values()) {
    if (!map.has(detail.fieldId)) {
      map.set(detail.fieldId, detail.name);
    }
  }
  return map;
}

/**
 * Get the display name for a field ID.
 */
export function getFieldName(index: QuantileDetailsIndex, fieldId: string): string {
  for (const detail of index.values()) {
    if (detail.fieldId === fieldId) return detail.name;
  }
  return fieldId;
}

/**
 * Get all available field IDs from the loaded index.
 */
export function getFieldIds(index: QuantileDetailsIndex): string[] {
  const ids = new Set<string>();
  for (const detail of index.values()) {
    ids.add(detail.fieldId);
  }
  return [...ids].sort();
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
