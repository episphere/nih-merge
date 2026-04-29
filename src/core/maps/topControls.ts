import * as d3 from 'd3';
import type { MapStore } from 'nanostores';
import type { MapsState, MapsMeasure } from './state';
import { createPopup, createDropdown } from '../shared/popup';
import { createOverlay } from '../shared/overlay';
import { downloadCSV, downloadTSV, downloadJSON } from '../shared/download';
import { renderDataTable, type DataTable } from '../shared/dataTable';
import { createCheckbox, createSelect } from '../shared/formElements';
import { USAComboBox } from '../../lib/USAComboBox';

// --- Measure labels ---

const MEASURE_LABELS: Record<MapsMeasure, string> = {
  ageAdjustedRate: 'Age-Adjusted Rate',
  crudeRate: 'Crude Rate',
  deaths: 'Deaths',
  population: 'Population',
};

// --- Color scheme options ---

const COLOR_SCHEMES: { value: string; label: string }[] = [
  { value: 'RdYlBu', label: 'Red-Yellow-Blue' },
  { value: 'RdYlGn', label: 'Red-Yellow-Green' },
  { value: 'RdBu', label: 'Red-Blue' },
  { value: 'PiYG', label: 'Pink-Yellow-Green' },
  { value: 'PRGn', label: 'Purple-Green' },
  { value: 'BrBG', label: 'Brown-Blue-Green' },
  { value: 'Spectral', label: 'Spectral' },
  { value: 'RdPu', label: 'Red-Purple' },
  { value: 'YlGnBu', label: 'Yellow-Green-Blue' },
  { value: 'YlOrRd', label: 'Yellow-Orange-Red' },
  { value: 'Blues', label: 'Blues' },
  { value: 'Greens', label: 'Greens' },
  { value: 'Oranges', label: 'Oranges' },
  { value: 'Reds', label: 'Reds' },
  { value: 'Purples', label: 'Purples' },
  { value: 'Greys', label: 'Greys' },
];


// --- Public ---

export function initTopControls(
  $state: MapStore<MapsState>,
  update: (change: Partial<MapsState>) => void,
  getData: () => Record<string, unknown>[],
): void {
  initGridEditButton($state, update);
  initSettingsButton($state, update);
  initTableButton(getData);
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

  // Color scheme combo box
  const colorSchemeGroup = document.createElement('div');
  colorSchemeGroup.className = 'usa-form-group';
  const colorSchemeLabel = document.createElement('label');
  colorSchemeLabel.className = 'usa-label';
  colorSchemeLabel.htmlFor = 'settings-color-scheme';
  colorSchemeLabel.textContent = 'Color Scheme';
  colorSchemeGroup.appendChild(colorSchemeLabel);

  const colorSchemeWrapper = document.createElement('div');
  colorSchemeWrapper.className = 'usa-combo-box';
  const colorSchemeSelect = document.createElement('select');
  colorSchemeSelect.className = 'usa-select';
  colorSchemeSelect.id = 'settings-color-scheme';
  colorSchemeSelect.name = 'settings-color-scheme';
  for (const scheme of COLOR_SCHEMES) {
    const opt = document.createElement('option');
    opt.value = scheme.value;
    opt.textContent = scheme.label;
    colorSchemeSelect.appendChild(opt);
  }
  colorSchemeWrapper.appendChild(colorSchemeSelect);
  colorSchemeGroup.appendChild(colorSchemeWrapper);
  content.appendChild(colorSchemeGroup);

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

  // Initialize combo box after it's in the DOM
  const colorSchemeComboBox = USAComboBox.create(colorSchemeWrapper);

  // Add gradient previews to combo box list items
  addGradientPreviews(colorSchemeWrapper);

  // Sync state → UI
  let syncingColorScheme = false;
  $state.subscribe((state) => {
    measure.select.value = state.measure;
    syncingColorScheme = true;
    colorSchemeComboBox.setSelectedByValue(state.colorScheme);
    syncingColorScheme = false;
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
  colorSchemeWrapper.addEventListener('usa-combo-box:selected', () => {
    if (syncingColorScheme) return;
    const value = colorSchemeComboBox.getValue();
    if (value) update({ colorScheme: value });
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
  getData: () => Record<string, unknown>[],
): void {
  const btn = document.getElementById('btn-table');
  if (!btn) return;

  const overlay = createOverlay({ title: 'Data Table' });
  let activeTable: DataTable | null = null;

  overlay.onClose(() => {
    if (activeTable) {
      activeTable.destroy();
      activeTable = null;
    }
  });

  btn.addEventListener('click', async () => {
    // Destroy previous table if any
    if (activeTable) {
      await activeTable.destroy();
      activeTable = null;
    }

    // Open overlay first so the container has layout dimensions
    overlay.open();

    const data = getData();
    activeTable = await renderDataTable(overlay.contentEl, data);
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

// --- Color scheme gradient helpers ---

const GRADIENT_STOPS = 10;

/** Create a small inline SVG showing a color scheme gradient. */
function createSchemeGradient(scheme: string, width: number, height: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));

  const gradientId = `scheme-grad-${scheme}`;
  const defs = document.createElementNS(ns, 'defs');
  const linearGrad = document.createElementNS(ns, 'linearGradient');
  linearGrad.setAttribute('id', gradientId);
  linearGrad.setAttribute('x1', '0%');
  linearGrad.setAttribute('x2', '100%');

  const interpolator = (d3 as Record<string, unknown>)[
    'interpolate' + scheme
  ] as ((t: number) => string) | undefined;

  if (interpolator) {
    for (let i = 0; i <= GRADIENT_STOPS; i++) {
      const t = i / GRADIENT_STOPS;
      const stop = document.createElementNS(ns, 'stop');
      stop.setAttribute('offset', `${(t * 100).toFixed(0)}%`);
      stop.setAttribute('stop-color', interpolator(t));
      linearGrad.appendChild(stop);
    }
  }

  defs.appendChild(linearGrad);
  svg.appendChild(defs);

  const rect = document.createElementNS(ns, 'rect');
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', String(height));
  rect.setAttribute('rx', '2');
  rect.setAttribute('fill', `url(#${gradientId})`);
  svg.appendChild(rect);

  return svg;
}

/** Add gradient preview SVGs to each combo box list option. */
function addGradientPreviews(wrapper: HTMLElement): void {
  const listItems = wrapper.querySelectorAll<HTMLLIElement>('.usa-combo-box__list-option');
  for (const li of listItems) {
    const scheme = li.dataset.value;
    if (!scheme) continue;
    const svg = createSchemeGradient(scheme, 60, 14);
    li.insertBefore(svg, li.firstChild);
  }
}
