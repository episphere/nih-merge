import {
  exportFromState,
  exportJSONFromState,
  exportParquetFromState,
} from '@jeyabbalas/data-table/advanced';
import type { ColumnSchema } from '@jeyabbalas/data-table';
import { renderDataTable, type DataTable } from './dataTable';
import type { TablePresentation, TableView } from './tableView';
import { triggerDownload } from './download';
import { createOverlay } from './overlay';
import { createDropdown, createPopup, type DropdownEntry } from './popup';

export type { TableView } from './tableView';

interface TableControls {
  close(): void;
  destroy(): void;
}

const NUMERIC_TYPES = new Set(['integer', 'float', 'decimal']);

export interface TableColumnPlan {
  order: string[];
  numeric: string[];
  defaultVisible: Set<string>;
}

export function planTableColumns(
  schema: ColumnSchema[],
  presentation: TablePresentation,
): TableColumnPlan {
  const available = schema.filter((column) => !column.system).map((column) => column.name);
  const availableSet = new Set(available);
  const fixed = presentation.fixedColumns.filter((column) => availableSet.has(column));
  const fixedSet = new Set(presentation.fixedColumns);
  const remainingDimensions = schema
    .filter((column) => !column.system && !NUMERIC_TYPES.has(column.type) && !fixedSet.has(column.name))
    .map((column) => column.name);
  const numeric = schema
    .filter((column) => !column.system && NUMERIC_TYPES.has(column.type) && !fixedSet.has(column.name))
    .map((column) => column.name);
  const withoutActive = numeric.filter((column) => column !== presentation.activeMeasure);
  const active = numeric.includes(presentation.activeMeasure) ? [presentation.activeMeasure] : [];
  const defaultVisible = new Set(
    presentation.defaultNumericColumns.filter((column) => numeric.includes(column)),
  );
  if (active.length > 0) defaultVisible.add(presentation.activeMeasure);
  return {
    order: [...fixed, ...remainingDimensions, ...withoutActive, ...active],
    numeric,
    defaultVisible,
  };
}

function orderedVisibleColumns(table: DataTable): string[] {
  const visible = new Set(table.state.visibleColumns.get());
  return table.state.columnOrder.get().filter((column) => visible.has(column));
}

function defaultOrder(table: DataTable, presentation: TablePresentation): string[] {
  return planTableColumns(table.state.schema.get(), presentation).order;
}

function applyDefaultColumns(table: DataTable, presentation: TablePresentation): void {
  const plan = planTableColumns(table.state.schema.get(), presentation);

  table.actions.setColumnOrder(plan.order);
  for (const column of plan.numeric) {
    if (plan.defaultVisible.has(column)) table.actions.showColumn(column);
    else table.actions.hideColumn(column);
  }
}

function addIconButton(toolbar: HTMLElement, iconClass: string, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'epi-icon-btn epi-overlay__tool-button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<i class="fa-solid ${iconClass}" aria-hidden="true"></i>`;
  toolbar.appendChild(button);
  return button;
}

function attachColumnChooser(
  table: DataTable,
  toolbar: HTMLElement,
  presentation: TablePresentation,
  onLayoutChange: () => void,
): TableControls {
  const button = addIconButton(toolbar, 'fa-table-columns', 'Choose table columns');
  const content = document.createElement('div');
  content.className = 'epi-column-chooser';
  const popup = createPopup(button, content, { title: 'Table Columns' });
  let inputs = new Map<string, HTMLInputElement>();

  const syncChecks = () => {
    const visible = new Set(table.state.visibleColumns.get());
    for (const [column, input] of inputs) input.checked = visible.has(column);
  };

  const rebuild = () => {
    content.replaceChildren();
    inputs = new Map();
    const plan = planTableColumns(table.state.schema.get(), presentation);
    for (const column of plan.numeric) {
      const wrapper = document.createElement('div');
      wrapper.className = 'usa-checkbox';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'usa-checkbox__input';
      input.id = `table-column-${table.instanceId}-${column}`;
      const label = document.createElement('label');
      label.className = 'usa-checkbox__label';
      label.htmlFor = input.id;
      label.textContent = presentation.aliases?.columns?.[column]
        ?? presentation.columnLabels?.[column]
        ?? column;
      input.addEventListener('change', () => {
        if (input.checked) table.actions.showColumn(column);
        else table.actions.hideColumn(column);
        onLayoutChange();
      });
      wrapper.append(input, label);
      content.appendChild(wrapper);
      inputs.set(column, input);
    }

    const actions = document.createElement('div');
    actions.className = 'epi-column-chooser__actions';
    const showAll = document.createElement('button');
    showAll.type = 'button';
    showAll.className = 'usa-button usa-button--unstyled';
    showAll.textContent = 'Show all';
    showAll.addEventListener('click', () => {
      for (const column of inputs.keys()) table.actions.showColumn(column);
      const order = defaultOrder(table, presentation);
      table.actions.setColumnOrder(order);
      onLayoutChange();
    });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'usa-button usa-button--unstyled';
    reset.textContent = 'Reset to defaults';
    reset.addEventListener('click', () => {
      applyDefaultColumns(table, presentation);
      onLayoutChange();
    });
    actions.append(showAll, reset);
    content.appendChild(actions);
    syncChecks();
  };

  button.addEventListener('click', popup.toggle);
  rebuild();
  const unsubscribeSchema = table.state.schema.subscribe(rebuild);
  const unsubscribeColumns = table.on('columnChange', syncChecks);

  return {
    close() {
      popup.close();
    },
    destroy() {
      unsubscribeSchema();
      unsubscribeColumns();
      button.removeEventListener('click', popup.toggle);
      popup.destroy();
      button.remove();
    },
  };
}

function attachExportDropdown(
  table: DataTable,
  toolbar: HTMLElement,
  presentation: TablePresentation,
): TableControls {
  const button = addIconButton(toolbar, 'fa-download', 'Export table');

  async function exportTable(format: 'csv' | 'json' | 'parquet'): Promise<void> {
    const columns = orderedVisibleColumns(table);
    const stem = presentation.exportFileStem;
    if (format === 'csv') {
      const csv = await exportFromState(table.state, table.bridge, {
        scope: 'filtered', columns, includeHeaders: true, delimiter: ',', nullValue: '',
      });
      triggerDownload(csv, `${stem}.csv`, 'text/csv;charset=utf-8');
    } else if (format === 'json') {
      const json = await exportJSONFromState(table.state, table.bridge, {
        scope: 'filtered', columns, format: 'array', pretty: true,
      });
      triggerDownload(json, `${stem}.json`, 'application/json;charset=utf-8');
    } else {
      const parquet = await exportParquetFromState(table.state, table.bridge, {
        scope: 'filtered', columns,
      });
      triggerDownload(parquet.buffer as ArrayBuffer, `${stem}.parquet`, 'application/vnd.apache.parquet');
    }
  }

  const items: DropdownEntry[] = [
    { label: 'Visible columns (.csv)', onClick: () => { void exportTable('csv'); } },
    { label: 'Visible columns (.json)', onClick: () => { void exportTable('json'); } },
    { label: 'Visible columns (.parquet)', onClick: () => { void exportTable('parquet'); } },
  ];
  const dropdown = createDropdown(button, items);
  return {
    close() { dropdown.close(); },
    destroy() { dropdown.destroy(); button.remove(); },
  };
}

function attachTableControls(
  table: DataTable,
  toolbar: HTMLElement,
  presentation: TablePresentation,
  onLayoutChange: () => void,
): TableControls {
  applyDefaultColumns(table, presentation);
  const chooser = attachColumnChooser(table, toolbar, presentation, onLayoutChange);
  const exporter = attachExportDropdown(table, toolbar, presentation);
  return {
    close() { chooser.close(); exporter.close(); },
    destroy() { chooser.destroy(); exporter.destroy(); },
  };
}

export function initDataTableButton(buttonId: string, getView: () => TableView): void {
  const button = document.getElementById(buttonId);
  if (!button) return;

  const overlay = createOverlay({ title: 'Data Table' });
  let activeTable: DataTable | null = null;
  let controls: TableControls | null = null;
  let lastKey = '';

  // Popups are portalled outside the overlay panel, so hiding the overlay must
  // explicitly dismiss them before the underlying page becomes interactive.
  overlay.onClose(() => controls?.close());

  button.addEventListener('click', async () => {
    const view = getView();
    if (activeTable && view.key === lastKey) {
      overlay.open();
      return;
    }

    overlay.subtitleEl.textContent = view.subtitle ?? '';
    overlay.open();
    overlay.showLoading();
    controls?.destroy();
    controls = null;
    overlay.toolbarEl.replaceChildren();
    if (activeTable) await activeTable.destroy();

    try {
      activeTable = await renderDataTable(
        overlay.contentEl,
        view.rows,
        overlay.el,
        view.presentation.aliases,
      );
      controls = attachTableControls(
        activeTable,
        overlay.toolbarEl,
        view.presentation,
        () => requestAnimationFrame(() => overlay.sizeToFit()),
      );
      lastKey = view.key;
      overlay.hideLoading();
      overlay.sizeToFit();
    } catch (error) {
      activeTable = null;
      lastKey = '';
      overlay.hideLoading();
      overlay.contentEl.innerHTML = '<p class="padding-3">Unable to load the data table.</p>';
      console.error(error);
    }
  });
}
