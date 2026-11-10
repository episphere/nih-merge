import type { MapStore } from 'nanostores';
import type { MapsState } from './state';
import { createPopup, createDropdown } from '../shared/popup';
import { downloadCSV, downloadTSV, downloadJSON } from '../shared/download';
import { initLazyDataTableButton } from '../shared/lazyDataTable';
import type { TableView } from '../shared/tableView';
import { createCheckbox } from '../shared/formElements';
import { downloadMapsFigurePNG, downloadMapsFigureSVG, type MapsFigureOptions } from '../shared/downloadImage';
import { element } from './editorUI';

export { getSchemeReverse } from './scales';

export function initTopControls(
  store: MapStore<MapsState>, update: (change: Partial<MapsState>) => void,
  getData: () => Record<string, unknown>[], getTableView: (cardId?: string) => TableView,
  getFigure: () => MapsFigureOptions | null,
): void {
  const grid = document.getElementById('btn-edit-grid');
  if (grid) createDropdown(grid, [
    { label: 'Add row', onClick: () => update({ nRows: store.get().nRows + 1 }) },
    { label: 'Add column', onClick: () => update({ nCols: store.get().nCols + 1 }) },
    'separator',
    { label: 'Remove last row', onClick: () => update({ nRows: Math.max(1, store.get().nRows - 1) }) },
    { label: 'Remove last column', onClick: () => update({ nCols: Math.max(1, store.get().nCols - 1) }) },
  ]);
  const settings = document.getElementById('btn-settings');
  if (settings) {
    const content = element('div');
    content.append(element('p', 'map-editor__hint', 'Borders apply to all maps. Edit colors and scale sharing using the gear beside each map’s legend.'));
    for (const [key, label] of [['showOutlineCounty', 'County borders'], ['showOutlineState', 'State borders'], ['showOutlineNation', 'Nation / extent border']] as const) {
      const control = createCheckbox(`dashboard-${key}`, label);
      content.append(control.wrapper);
      store.subscribe(state => { control.input.checked = state[key]; });
      control.input.addEventListener('change', () => update({ [key]: control.input.checked }));
    }
    const popup = createPopup(settings, content, { title: 'Dashboard appearance' });
    settings.addEventListener('click', () => popup.toggle());
  }
  initLazyDataTableButton('btn-table', getTableView);
  const download = document.getElementById('btn-download');
  if (download) createDropdown(download, [
    { label: 'Data (.csv)', onClick: () => downloadCSV(getData(), 'nih-merge-maps.csv') },
    { label: 'Data (.tsv)', onClick: () => downloadTSV(getData(), 'nih-merge-maps.tsv') },
    { label: 'Data (.json)', onClick: () => downloadJSON(getData(), 'nih-merge-maps.json') },
    'separator',
    { label: 'Image (.png)', onClick: () => { const figure = getFigure(); if (figure) downloadMapsFigurePNG(figure); } },
    { label: 'Image (.svg)', onClick: () => { const figure = getFigure(); if (figure) downloadMapsFigureSVG(figure); } },
  ]);
}
