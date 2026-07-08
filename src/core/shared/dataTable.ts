/**
 * Shared data table renderer — wraps @jeyabbalas/data-table.
 */
import { createDataTable, type DataTable, type Filter } from '@jeyabbalas/data-table';
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

export async function renderDataTableFromUrl(
  container: HTMLElement,
  url: string,
  filters: Filter[],
): Promise<DataTable> {
  container.innerHTML = '';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load table data: ${response.status}`);
  }
  const source = await response.blob();
  const table = await createDataTable({
    container,
    source,
    sourceFormat: 'parquet',
    persistence: false,
    presets: false,
    undoRedo: true,
    expressionFilter: false,
    colorScheme: 'light',
  });
  for (const filter of filters) {
    console.log(filter);
    table.actions.addFilter(filter);
  }
  return table;
}
