/**
 * Shared data table renderer — wraps @jeyabbalas/data-table.
 */
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

export type { DataTable };

export async function renderDataTable(
  container: HTMLElement,
  data: Record<string, unknown>[],
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
    colorScheme: 'light',
  });
  return table;
}
