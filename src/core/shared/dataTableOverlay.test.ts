import { describe, expect, it } from 'vitest';
import type { ColumnSchema } from '@jeyabbalas/data-table';
import type { TablePresentation } from './dataTable';
import { planTableColumns } from './dataTableOverlay';

function column(name: string, type: ColumnSchema['type'], system = false): ColumnSchema {
  return { name, type, nullable: true, originalType: type, system };
}

function presentation(activeMeasure: string): TablePresentation {
  return {
    fixedColumns: ['year', 'quantile_bin', 'group'],
    activeMeasure,
    defaultNumericColumns: ['deaths', 'population', activeMeasure],
    exportFileStem: 'test',
  };
}

describe('table column presentation', () => {
  it('keeps numeric dimensions fixed and puts the selected measure last', () => {
    const plan = planTableColumns([
      column('__rowid__', 'integer', true),
      column('group', 'string'),
      column('quantile_bin', 'integer'),
      column('deaths', 'integer'),
      column('population', 'integer'),
      column('crudeRate', 'float'),
      column('rateRatio', 'float'),
    ], presentation('rateRatio'));

    expect(plan.order).toEqual([
      'quantile_bin', 'group', 'deaths', 'population', 'crudeRate', 'rateRatio',
    ]);
    expect(plan.numeric).toEqual(['deaths', 'population', 'crudeRate', 'rateRatio']);
    expect([...plan.defaultVisible]).toEqual(['deaths', 'population', 'rateRatio']);
  });

  it('ignores unavailable defaults and deduplicates a selected base measure', () => {
    const plan = planTableColumns([
      column('year', 'string'),
      column('region', 'string'),
      column('population', 'integer'),
    ], presentation('population'));

    expect(plan.order).toEqual(['year', 'region', 'population']);
    expect([...plan.defaultVisible]).toEqual(['population']);
  });
});
