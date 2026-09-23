/**
 * Shared data table renderer — wraps @jeyabbalas/data-table.
 */
import {
  createDataTable,
  type DataTable,
  type DataTableAliases,
} from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';
import { getTableBridge } from './tableEngine';

export type { DataTable };

export type { TablePresentation } from './tableView';

export async function renderDataTable(
  container: HTMLElement,
  data: Record<string, unknown>[],
  portalTarget?: HTMLElement,
  aliases?: DataTableAliases,
): Promise<DataTable> {
  performance.mark('nih-merge:table-render-start');
  container.innerHTML = '';
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const bridge = await getTableBridge();
  const table = await createDataTable({
    container,
    source: blob,
    sourceFormat: 'json',
    aliases,
    bridge,
    persistence: false,
    presets: false,
    undoRedo: false,
    expressionFilter: false,
    exportDialog: false,
    portalTarget,
    colorScheme: 'light',
  });
  performance.mark('nih-merge:table-render-end');
  performance.measure(
    'nih-merge:table-render',
    'nih-merge:table-render-start',
    'nih-merge:table-render-end',
  );
  return table;
}
