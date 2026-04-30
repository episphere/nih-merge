/**
 * Converts app filter semantics to @jeyabbalas/data-table Filter objects.
 */
import type { Filter } from '@jeyabbalas/data-table';

/** A single filter spec: column name + the app-level filter value. */
export interface TableFilterSpec {
  column: string;
  /** 'All' = aggregate row, '*' = all non-aggregate rows, specific string, or array */
  value: string | string[];
}

/** Info needed to open a full-dataset table with pre-applied filters. */
export interface TableInfo {
  url: string;
  filters: TableFilterSpec[];
}

/** Convert app-level filter specs into data-table Filter objects. */
export function buildTableFilters(specs: TableFilterSpec[]): Filter[] {
  const filters: Filter[] = [];
  for (const { column, value } of specs) {
    if (value === 'All') {
      // Show aggregate rows
      filters.push({ type: 'point', column, value: 'All' });
    } else if (value === '*') {
      // Exclude aggregate rows — show all breakdown values
      filters.push({ type: 'not-set', column, values: ['All'] });
    } else if (Array.isArray(value)) {
      filters.push({ type: 'set', column, values: value });
    } else {
      filters.push({ type: 'point', column, value });
    }
  }
  return filters;
}
