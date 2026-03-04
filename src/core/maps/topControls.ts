import type { MapStore } from 'nanostores';
import type { MapsState, MapsMeasure } from './state';
import { createPopup, createDropdown } from '../shared/popup';
import { createOverlay } from '../shared/overlay';
import { downloadCSV, downloadTSV, downloadJSON } from '../shared/download';
import { renderDataTable, type TableColumn } from '../shared/dataTable';
import { createCheckbox, createSelect } from '../shared/formElements';

// --- Measure labels ---

const MEASURE_LABELS: Record<MapsMeasure, string> = {
  ageAdjustedRate: 'Age-Adjusted Rate',
  crudeRate: 'Crude Rate',
  deaths: 'Deaths',
  population: 'Population',
};

// --- Color scheme options ---

const COLOR_SCHEMES = [
  'RdYlBu', 'RdYlGn', 'RdBu', 'PiYG', 'PRGn', 'BrBG',
  'Spectral', 'RdPu', 'YlGnBu', 'YlOrRd', 'Blues', 'Greens',
  'Oranges', 'Reds', 'Purples', 'Greys',
];

// --- Table columns ---

const MORTALITY_COLUMNS: TableColumn[] = [
  { field: 'regionName', title: 'Region', frozen: true },
  { field: 'cause', title: 'Cancer Site' },
  { field: 'race', title: 'Race/Ethnicity' },
  { field: 'sex', title: 'Sex' },
  { field: 'deaths', title: 'Deaths' },
  { field: 'population', title: 'Population' },
  { field: 'crudeRate', title: 'Crude Rate' },
  { field: 'ageAdjustedRate', title: 'Age-Adjusted Rate' },
];

const POPULATION_COLUMNS: TableColumn[] = [
  { field: 'regionName', title: 'Region', frozen: true },
  { field: 'race', title: 'Race/Ethnicity' },
  { field: 'sex', title: 'Sex' },
  { field: 'population', title: 'Population' },
];

// --- Public ---

export function initTopControls(
  $state: MapStore<MapsState>,
  update: (change: Partial<MapsState>) => void,
  getData: () => Record<string, unknown>[],
): void {
  initGridEditButton($state, update);
  initSettingsButton($state, update);
  initTableButton($state, getData);
  initDownloadButton(getData);
}

// --- Grid edit button ---

function initGridEditButton(
  $state: MapStore<MapsState>,
  update: (change: Partial<MapsState>) => void,
): void {
  const btn = document.getElementById('btn-edit-grid');
  if (!btn) return;

  createDropdown(btn, [
    {
      label: 'Add Row',
      onClick: () => {
        const s = $state.get();
        update({ nRows: s.nRows + 1 });
      },
    },
    {
      label: 'Add Column',
      onClick: () => {
        const s = $state.get();
        update({ nCols: s.nCols + 1 });
      },
    },
    'separator',
    {
      label: 'Remove Row',
      onClick: () => {
        const s = $state.get();
        if (s.nRows > 1) update({ nRows: s.nRows - 1 });
      },
    },
    {
      label: 'Remove Column',
      onClick: () => {
        const s = $state.get();
        if (s.nCols > 1) update({ nCols: s.nCols - 1 });
      },
    },
  ]);
}

// --- Settings button ---

function initSettingsButton(
  $state: MapStore<MapsState>,
  update: (change: Partial<MapsState>) => void,
): void {
  const btn = document.getElementById('btn-settings');
  if (!btn) return;

  const content = document.createElement('div');

  // Measure select
  const measure = createSelect('settings-measure', 'Measure');
  for (const [value, label] of Object.entries(MEASURE_LABELS)) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    measure.select.appendChild(opt);
  }
  content.appendChild(measure.group);

  // Color scheme select
  const colorScheme = createSelect('settings-color-scheme', 'Color Scheme');
  for (const scheme of COLOR_SCHEMES) {
    const opt = document.createElement('option');
    opt.value = scheme;
    opt.textContent = scheme;
    colorScheme.select.appendChild(opt);
  }
  content.appendChild(colorScheme.group);

  // Color checkboxes
  const reverse = createCheckbox('settings-reverse', 'Reverse Colors');
  content.appendChild(reverse.wrapper);

  const center = createCheckbox('settings-center', 'Center on Mean');
  content.appendChild(center.wrapper);

  const exclude = createCheckbox('settings-exclude', 'Exclude Extreme Values');
  content.appendChild(exclude.wrapper);

  // Cutoff range
  const cutoffGroup = document.createElement('div');
  cutoffGroup.className = 'usa-form-group';
  const cutoffLabel = document.createElement('label');
  cutoffLabel.className = 'usa-label';
  cutoffLabel.htmlFor = 'settings-cutoff';
  cutoffLabel.textContent = 'Extreme Cutoff';
  const cutoffValue = document.createElement('span');
  cutoffValue.className = 'margin-left-1 font-sans-3xs';
  cutoffLabel.appendChild(cutoffValue);
  const cutoffInput = document.createElement('input');
  cutoffInput.type = 'range';
  cutoffInput.className = 'usa-range';
  cutoffInput.id = 'settings-cutoff';
  cutoffInput.min = '1';
  cutoffInput.max = '5';
  cutoffInput.step = '0.5';
  cutoffGroup.appendChild(cutoffLabel);
  cutoffGroup.appendChild(cutoffInput);
  content.appendChild(cutoffGroup);

  // Outline section
  const outlineTitle = document.createElement('span');
  outlineTitle.className = 'usa-legend text-bold';
  outlineTitle.textContent = 'Outlines';
  content.appendChild(outlineTitle);

  const countyOutline = createCheckbox('settings-outline-county', 'County Borders');
  content.appendChild(countyOutline.wrapper);

  const stateOutline = createCheckbox('settings-outline-state', 'State Borders');
  content.appendChild(stateOutline.wrapper);

  const nationOutline = createCheckbox('settings-outline-nation', 'Nation Border');
  content.appendChild(nationOutline.wrapper);

  const popup = createPopup(btn, content, { title: 'Map Settings' });
  btn.addEventListener('click', () => popup.toggle());

  // Sync state → UI
  $state.subscribe((state) => {
    measure.select.value = state.measure;
    colorScheme.select.value = state.colorScheme;
    reverse.input.checked = state.colorReverse;
    center.input.checked = state.colorCenterMean;
    exclude.input.checked = state.colorExcludeExtremes;
    cutoffInput.value = String(state.colorExtremeCutoff);
    cutoffValue.textContent = `±${state.colorExtremeCutoff}σ`;
    cutoffGroup.style.display = state.colorExcludeExtremes ? '' : 'none';
    countyOutline.input.checked = state.showOutlineCounty;
    stateOutline.input.checked = state.showOutlineState;
    nationOutline.input.checked = state.showOutlineNation;
  });

  // UI → state
  measure.select.addEventListener('change', () => {
    update({ measure: measure.select.value as MapsMeasure });
  });
  colorScheme.select.addEventListener('change', () => {
    update({ colorScheme: colorScheme.select.value });
  });
  reverse.input.addEventListener('change', () => {
    update({ colorReverse: reverse.input.checked });
  });
  center.input.addEventListener('change', () => {
    update({ colorCenterMean: center.input.checked });
  });
  exclude.input.addEventListener('change', () => {
    update({ colorExcludeExtremes: exclude.input.checked });
  });
  cutoffInput.addEventListener('input', () => {
    update({ colorExtremeCutoff: parseFloat(cutoffInput.value) });
  });
  countyOutline.input.addEventListener('change', () => {
    update({ showOutlineCounty: countyOutline.input.checked });
  });
  stateOutline.input.addEventListener('change', () => {
    update({ showOutlineState: stateOutline.input.checked });
  });
  nationOutline.input.addEventListener('change', () => {
    update({ showOutlineNation: nationOutline.input.checked });
  });
}

// --- Table button ---

function initTableButton(
  $state: MapStore<MapsState>,
  getData: () => Record<string, unknown>[],
): void {
  const btn = document.getElementById('btn-table');
  if (!btn) return;

  const overlay = createOverlay({ title: 'Data Table' });

  // Download button in toolbar
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'epi-icon-btn';
  downloadBtn.type = 'button';
  downloadBtn.title = 'Download table data';
  downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
  overlay.toolbarEl.appendChild(downloadBtn);

  createDropdown(downloadBtn, [
    { label: 'CSV (.csv)', onClick: () => downloadCSV(getData(), 'epitracker-maps.csv') },
    { label: 'TSV (.tsv)', onClick: () => downloadTSV(getData(), 'epitracker-maps.tsv') },
    { label: 'JSON (.json)', onClick: () => downloadJSON(getData(), 'epitracker-maps.json') },
  ]);

  btn.addEventListener('click', () => {
    const state = $state.get();
    const data = getData();
    const columns = state.measure === 'population' ? POPULATION_COLUMNS : MORTALITY_COLUMNS;

    const dataKeys = data.length > 0 ? new Set(Object.keys(data[0])) : new Set<string>();
    const activeColumns = columns.filter((col) => dataKeys.has(col.field));
    renderDataTable(overlay.contentEl, data, activeColumns);
    overlay.open();
  });
}

// --- Download button ---

function initDownloadButton(
  getData: () => Record<string, unknown>[],
): void {
  const btn = document.getElementById('btn-download');
  if (!btn) return;

  createDropdown(btn, [
    { label: 'Data (.csv)', onClick: () => downloadCSV(getData(), 'epitracker-maps.csv') },
    { label: 'Data (.tsv)', onClick: () => downloadTSV(getData(), 'epitracker-maps.tsv') },
    { label: 'Data (.json)', onClick: () => downloadJSON(getData(), 'epitracker-maps.json') },
  ]);
}
