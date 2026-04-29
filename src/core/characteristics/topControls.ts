import type { MapStore } from 'nanostores';
import type { CharacteristicsState } from './state';
import { createPopup } from '../shared/popup';
import { createDropdown } from '../shared/popup';
import { createOverlay } from '../shared/overlay';
import { downloadCSV, downloadTSV, downloadJSON } from '../shared/download';
import { downloadFigurePNG, downloadFigureSVG, getFigureOptions } from '../shared/downloadImage';
import { renderDataTable, type DataTable } from '../shared/dataTable';

/**
 * Wire the 4 top-control icon buttons to their respective popups/dropdowns/overlays.
 */
export function initTopControls(
  $state: MapStore<CharacteristicsState>,
  update: (change: Partial<CharacteristicsState>) => void,
  getData?: () => Record<string, unknown>[],
): void {
  initFilterButton($state);
  initSettingsButton($state, update);
  initTableButton(getData);
  initDownloadButton(getData);
}

// --- Filter button ---

function initFilterButton($state: MapStore<CharacteristicsState>): void {
  const btn = document.getElementById('btn-filter');
  if (!btn) return;

  const content = document.createElement('div');

  const colorFieldset = document.createElement('fieldset');
  colorFieldset.className = 'usa-fieldset epi-filter-fieldset';
  const colorLegend = document.createElement('legend');
  colorLegend.className = 'usa-legend text-bold';
  colorLegend.textContent = 'Within Plot';
  colorFieldset.appendChild(colorLegend);

  const colorContainer = document.getElementById('filter-compare-color');
  if (colorContainer) colorFieldset.appendChild(colorContainer);
  content.appendChild(colorFieldset);

  const facetFieldset = document.createElement('fieldset');
  facetFieldset.className = 'usa-fieldset epi-filter-fieldset';
  const facetLegend = document.createElement('legend');
  facetLegend.className = 'usa-legend text-bold';
  facetLegend.textContent = 'Between Plot';
  facetFieldset.appendChild(facetLegend);

  const facetContainer = document.getElementById('filter-compare-facet');
  if (facetContainer) facetFieldset.appendChild(facetContainer);
  content.appendChild(facetFieldset);

  const popup = createPopup(btn, content, { title: 'Filter' });

  btn.addEventListener('click', () => popup.toggle());

  $state.subscribe((state) => {
    colorFieldset.classList.toggle('hidden', state.compareColor === 'none');
    facetFieldset.classList.toggle('hidden', state.compareFacet === 'none');

    const hasComparisons = state.compareColor !== 'none' || state.compareFacet !== 'none';
    btn.toggleAttribute('disabled', !hasComparisons);
  });
}

// --- Settings button ---

function initSettingsButton(
  $state: MapStore<CharacteristicsState>,
  update: (change: Partial<CharacteristicsState>) => void,
): void {
  const btn = document.getElementById('btn-settings');
  if (!btn) return;

  const content = document.createElement('div');

  const checkboxes: { key: keyof CharacteristicsState; label: string; id: string }[] = [
    { key: 'showCI', label: 'Show confidence intervals', id: 'checkbox-show-ci' },
    { key: 'showLines', label: 'Show connecting lines', id: 'checkbox-show-lines' },
    { key: 'startZero', label: 'Start y-axis at zero', id: 'checkbox-start-zero' },
  ];

  const inputs: { key: keyof CharacteristicsState; input: HTMLInputElement }[] = [];

  for (const cb of checkboxes) {
    const wrapper = document.createElement('div');
    wrapper.className = 'usa-checkbox';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'usa-checkbox__input';
    input.id = cb.id;

    const label = document.createElement('label');
    label.className = 'usa-checkbox__label';
    label.htmlFor = cb.id;
    label.textContent = cb.label;

    wrapper.appendChild(input);
    wrapper.appendChild(label);
    content.appendChild(wrapper);

    inputs.push({ key: cb.key, input });

    input.addEventListener('change', () => {
      update({ [cb.key]: input.checked } as Partial<CharacteristicsState>);
    });
  }

  const popup = createPopup(btn, content, { title: 'Graph Settings' });

  btn.addEventListener('click', () => popup.toggle());

  $state.subscribe((state) => {
    for (const { key, input } of inputs) {
      input.checked = state[key] as boolean;
    }
  });
}

// --- Table button ---

function initTableButton(getData?: () => Record<string, unknown>[]): void {
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
    // Set subtitle from current plot title
    const titleEl = document.getElementById('title');
    overlay.subtitleEl.textContent = titleEl?.textContent ?? '';

    // Destroy previous table if any
    if (activeTable) {
      await activeTable.destroy();
      activeTable = null;
    }

    // Open overlay first so the container has layout dimensions
    overlay.open();

    // Render table with current data
    if (getData) {
      const data = getData();
      activeTable = await renderDataTable(overlay.contentEl, data);
    } else {
      overlay.contentEl.innerHTML = '<p class="padding-3">No data available.</p>';
    }
  });
}

// --- Download button ---

function initDownloadButton(getData?: () => Record<string, unknown>[]): void {
  const btn = document.getElementById('btn-download');
  if (!btn) return;

  createDropdown(btn, [
    { label: 'Data (.csv)', onClick: () => getData && downloadCSV(getData(), 'epitracker-characteristics.csv') },
    { label: 'Data (.tsv)', onClick: () => getData && downloadTSV(getData(), 'epitracker-characteristics.tsv') },
    { label: 'Data (.json)', onClick: () => getData && downloadJSON(getData(), 'epitracker-characteristics.json') },
    'separator',
    { label: 'Image (.png)', onClick: () => { const o = getFigureOptions('epitracker-characteristics'); if (o) downloadFigurePNG(o); } },
    { label: 'Image (.svg)', onClick: () => { const o = getFigureOptions('epitracker-characteristics'); if (o) downloadFigureSVG(o); } },
  ]);
}
