/**
 * Shared data table renderer — wraps @jeyabbalas/data-table.
 */
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

export type { DataTable };

export interface TablePresentation {
  /** Dimension/context columns that remain visible and are not user-selectable. */
  fixedColumns: string[];
  /** Currently selected dashboard measure; placed last when available. */
  activeMeasure: string;
  /** Numeric columns visible when the table is first opened or reset. */
  defaultNumericColumns: string[];
  /** Human-readable names used by the column chooser. */
  columnLabels?: Record<string, string>;
  /** Filename stem for exports launched from the table overlay. */
  exportFileStem: string;
}

export async function renderDataTable(
  container: HTMLElement,
  data: Record<string, unknown>[],
  portalTarget?: HTMLElement,
): Promise<DataTable> {
  container.innerHTML = '';
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const table = await createDataTable({
    container,
    source: blob,
    sourceFormat: 'json',
    persistence: false,
    presets: false,
    undoRedo: false,
    expressionFilter: false,
    exportDialog: false,
    portalTarget,
    colorScheme: 'light',
  });
  return table;
}
