import type { MapStore } from 'nanostores';
import type { DeterminantsState } from './state';
import { createPopup } from '../shared/popup';
import { createDropdown } from '../shared/popup';
import { createOverlay } from '../shared/overlay';

/**
 * Wire the 4 top-control icon buttons to their respective popups/dropdowns/overlays.
 */
export function initTopControls(
  $state: MapStore<DeterminantsState>,
  update: (change: Partial<DeterminantsState>) => void,
): void {
  initFilterButton($state);
  initSettingsButton($state, update);
  initTableButton();
  initDownloadButton();
}

// --- Filter button ---

function initFilterButton($state: MapStore<DeterminantsState>): void {
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
  });
}

// --- Settings button ---

function initSettingsButton(
  $state: MapStore<DeterminantsState>,
  update: (change: Partial<DeterminantsState>) => void,
): void {
  const btn = document.getElementById('btn-settings');
  if (!btn) return;

  const content = document.createElement('div');

  const checkboxes: { key: keyof DeterminantsState; label: string; id: string }[] = [
    { key: 'showCI', label: 'Show confidence intervals', id: 'checkbox-show-ci' },
    { key: 'showLines', label: 'Show connecting lines', id: 'checkbox-show-lines' },
    { key: 'startZero', label: 'Start y-axis at zero', id: 'checkbox-start-zero' },
  ];

  const inputs: { key: keyof DeterminantsState; input: HTMLInputElement }[] = [];

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
      update({ [cb.key]: input.checked } as Partial<DeterminantsState>);
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

function initTableButton(): void {
  const btn = document.getElementById('btn-table');
  if (!btn) return;

  const overlay = createOverlay({ title: 'Data Table' });
  overlay.contentEl.innerHTML = '<p class="padding-3">Data table coming soon.</p>';

  btn.addEventListener('click', () => overlay.open());
}

// --- Download button ---

function initDownloadButton(): void {
  const btn = document.getElementById('btn-download');
  if (!btn) return;

  createDropdown(btn, [
    { label: 'Data (.csv)', onClick: () => console.log('Download CSV') },
    { label: 'Data (.tsv)', onClick: () => console.log('Download TSV') },
    { label: 'Data (.json)', onClick: () => console.log('Download JSON') },
    'separator',
    { label: 'Image (.png)', onClick: () => console.log('Download PNG') },
    { label: 'Image (.svg)', onClick: () => console.log('Download SVG') },
  ]);
}
