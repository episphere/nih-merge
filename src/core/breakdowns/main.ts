import { initLayout } from '../shared/initLayout';
import { createDashboardStore } from '../shared/state/createStore';
import { syncStoreToURL } from '../shared/state/urlSync';
import { onResize } from '../shared/resizeObserver';
import { BREAKDOWNS_DEFAULTS, resolveBreakdowns, type BreakdownsState } from './state';
import { initControls } from './controls';
import { initTopControls } from './topControls';
import { fetchData, applyPlotFilters, deriveFilterOptions, type EnrichedAgeRow } from './query';
import { renderPlot } from './plot';

// 1. Layout
initLayout();

// 2. Store
const { $state, update } = createDashboardStore(BREAKDOWNS_DEFAULTS, resolveBreakdowns);

// 3. Controls
initControls($state, update);
initTopControls($state, update);

// 4. URL sync
const URL_KEYS: (keyof typeof BREAKDOWNS_DEFAULTS & string)[] = [
  'year', 'cause', 'race', 'sex', 'ageGroup',
  'stateFips', 'measure', 'compareBar', 'compareFacet', 'showCI',
];
syncStoreToURL($state, update, URL_KEYS);

// 5. Render loop with query-key separation
// Only these keys require a data re-fetch; all others are display-only.
const QUERY_KEYS: (keyof BreakdownsState)[] = [
  'year', 'cause', 'race', 'sex', 'ageGroup',
  'stateFips', 'compareBar', 'compareFacet',
];

let lastData: EnrichedAgeRow[] = [];
let renderVersion = 0;
let prevQuerySnapshot: string = '';

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function querySnapshot(state: BreakdownsState): string {
  return QUERY_KEYS.map(k => String(state[k])).join('\0');
}

$state.subscribe(async (state) => {
  const snap = querySnapshot(state);
  const needsFetch = snap !== prevQuerySnapshot;

  if (needsFetch) {
    prevQuerySnapshot = snap;
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
  }

  render();
});

function render(): void {
  const state = $state.get();
  const filtered = applyPlotFilters(state, lastData);
  renderPlot(state, filtered);
}

// 6. Re-render on resize — clear the plot immediately so the user sees the
//    resize happening and so the container can reflow without stale SVG dimensions.
//    #plot-container's height is CSS-constrained (calc(100vh - 5rem), max 785px)
//    so the ResizeObserver catches both horizontal and vertical changes.
const plotEl = document.getElementById('plot');
function clearPlot(): void {
  if (plotEl) plotEl.replaceChildren();
}

if (plotEl) {
  onResize(plotEl, render, 300, clearPlot);
}
