/**
 * Shared data table renderer — wraps @jeyabbalas/data-table.
 */
import { createDataTable, type DataTable, type Filter } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';
import { queryParquet } from '../../data-access/duckdb-parquet';

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
  const clauses: string[] = [];
  const parameters: unknown[] = [];

  for (const filter of filters) {
    const column = `"${filter.column.replaceAll('"', '""')}"`;
    if (filter.type === 'point') {
      if (filter.value === null) {
        clauses.push(`${column} IS NULL`);
      } else {
        clauses.push(`${column} = ?`);
        parameters.push(filter.value);
      }
    } else if (filter.type === 'set' || filter.type === 'not-set') {
      if (filter.values.length === 0) {
        clauses.push(filter.type === 'set' ? 'FALSE' : 'TRUE');
      } else {
        const operator = filter.type === 'set' ? 'IN' : 'NOT IN';
        clauses.push(`${column} ${operator} (${filter.values.map(() => '?').join(', ')})`);
        parameters.push(...filter.values);
      }
    } else {
      throw new Error(`Unsupported initial table filter: ${filter.type}`);
    }
  }

  const rows = await queryParquet(url, [], clauses.length > 0 ? clauses.join(' AND ') : 'TRUE', parameters);
  return renderDataTable(container, rows);
}
