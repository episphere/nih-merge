import type { MapStore } from 'nanostores';
import type { BreakdownsState } from './state';
import { createPopup } from '../shared/popup';
import { createDropdown } from '../shared/popup';
import { createOverlay } from '../shared/overlay';
import { downloadCSV, downloadTSV, downloadJSON } from '../shared/download';
import { downloadFigurePNG, downloadFigureSVG, getFigureOptions } from '../shared/downloadImage';

/**
 * Wire the 4 top-control icon buttons to their respective popups/dropdowns/overlays.
 */
export function initTopControls(
  $state: MapStore<BreakdownsState>,
  update: (change: Partial<BreakdownsState>) => void,
  getData?: () => Record<string, unknown>[],
): void {
  initFilterButton($state);
  initSettingsButton($state, update);
  initTableButton();
  initDownloadButton(getData);
}

// --- Filter button ---

function initFilterButton($state: MapStore<BreakdownsState>): void {
  const btn = document.getElementById('btn-filter');
  if (!btn) return;

  // Build popup content: two fieldsets wrapping the existing filter containers
  const content = document.createElement('div');

  const barFieldset = document.createElement('fieldset');
  barFieldset.className = 'usa-fieldset epi-filter-fieldset';
  const barLegend = document.createElement('legend');
  barLegend.className = 'usa-legend text-bold';
  barLegend.textContent = 'Within Plot';
  barFieldset.appendChild(barLegend);

  const barContainer = document.getElementById('filter-compare-bar');
  if (barContainer) barFieldset.appendChild(barContainer);
  content.appendChild(barFieldset);

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

  // Show/hide fieldsets based on comparison axes
  $state.subscribe((state) => {
    barFieldset.classList.toggle('hidden', state.compareBar === 'none');
    facetFieldset.classList.toggle('hidden', state.compareFacet === 'none');
  });
}

// --- Settings button ---

function initSettingsButton(
  $state: MapStore<BreakdownsState>,
  update: (change: Partial<BreakdownsState>) => void,
): void {
  const btn = document.getElementById('btn-settings');
  if (!btn) return;

  const content = document.createElement('div');

  const wrapper = document.createElement('div');
  wrapper.className = 'usa-checkbox';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'usa-checkbox__input';
  input.id = 'checkbox-show-ci';

  const label = document.createElement('label');
  label.className = 'usa-checkbox__label';
  label.htmlFor = 'checkbox-show-ci';
  label.textContent = 'Show confidence intervals';

  wrapper.appendChild(input);
  wrapper.appendChild(label);
  content.appendChild(wrapper);

  const popup = createPopup(btn, content, { title: 'Graph Settings' });

  btn.addEventListener('click', () => popup.toggle());

  // Sync checkbox to state
  $state.subscribe((state) => {
    input.checked = state.showCI;
  });

  input.addEventListener('change', () => {
    update({ showCI: input.checked });
  });
}

// --- Table button ---

function initTableButton(): void {
  const btn = document.getElementById('btn-table');
  if (!btn) return;

  const overlay = createOverlay({ title: 'Data Table' });
  overlay.contentEl.innerHTML = '<p class="padding-3">Data table coming soon.</p>';

  btn.addEventListener('click', () => overlay.open());
}

// --- Download button ---

function initDownloadButton(getData?: () => Record<string, unknown>[]): void {
  const btn = document.getElementById('btn-download');
  if (!btn) return;

  createDropdown(btn, [
    { label: 'Data (.csv)', onClick: () => getData && downloadCSV(getData(), 'epitracker-breakdowns.csv') },
    { label: 'Data (.tsv)', onClick: () => getData && downloadTSV(getData(), 'epitracker-breakdowns.tsv') },
    { label: 'Data (.json)', onClick: () => getData && downloadJSON(getData(), 'epitracker-breakdowns.json') },
    'separator',
    { label: 'Image (.png)', onClick: () => { const o = getFigureOptions('epitracker-breakdowns'); if (o) downloadFigurePNG(o); } },
    { label: 'Image (.svg)', onClick: () => { const o = getFigureOptions('epitracker-breakdowns'); if (o) downloadFigureSVG(o); } },
  ]);
}
