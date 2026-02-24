import { initLayout } from '../shared/initLayout';
import { createDashboardStore } from '../shared/state/createStore';
import { syncStoreToURL } from '../shared/state/urlSync';
import { onResize } from '../shared/resizeObserver';
import { BREAKDOWNS_DEFAULTS, resolveBreakdowns } from './state';
import { initControls } from './controls';
import { fetchData, applyPlotFilters, deriveFilterOptions, type EnrichedAgeRow } from './query';
import { renderPlot } from './plot';

// 1. Layout
initLayout();

// 2. Store
const { $state, update } = createDashboardStore(BREAKDOWNS_DEFAULTS, resolveBreakdowns);

// 3. Controls
initControls($state, update);

// 4. URL sync
const URL_KEYS: (keyof typeof BREAKDOWNS_DEFAULTS & string)[] = [
  'year', 'cause', 'race', 'sex', 'ageGroup',
  'stateFips', 'measure', 'compareBar', 'compareFacet', 'showCI',
];
syncStoreToURL($state, update, URL_KEYS);

// 5. Render loop: state → fetch → derive filter options → apply filters → render
let lastData: EnrichedAgeRow[] = [];
let renderVersion = 0;

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

$state.subscribe(async (state) => {
  const version = ++renderVersion;
  const data = await fetchData(state);
  if (version !== renderVersion) return; // stale
  lastData = data;

  // Update filter options from the actual query results (only if changed to avoid loop)
  const filterOptions = deriveFilterOptions(state, data);
  if (
    !arraysEqual(state.compareBarFilterOptions, filterOptions.compareBarFilterOptions) ||
    !arraysEqual(state.compareFacetFilterOptions, filterOptions.compareFacetFilterOptions)
  ) {
    update(filterOptions);
    return; // update() will re-trigger this subscribe; render on the next pass
  }

  render();
});

function render(): void {
  const state = $state.get();
  const filtered = applyPlotFilters(state, lastData);
  renderPlot(state, filtered);
}

// 6. Re-render on container resize
const plotEl = document.getElementById('plot');
if (plotEl) {
  onResize(plotEl, render);
}
