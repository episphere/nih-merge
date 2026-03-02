import { initLayout } from '../shared/initLayout';
import { createDashboardStore } from '../shared/state/createStore';
import { syncStoreToURL } from '../shared/state/urlSync';
import { onResize } from '../shared/resizeObserver';
import { DETERMINANTS_DEFAULTS, resolveDeterminants, type DeterminantsState } from './state';
import { initControls, setQuantileFieldGroups } from './controls';
import { initTopControls } from './topControls';
import { fetchData, applyPlotFilters, deriveFilterOptions, type EnrichedQuantileRow } from './query';
import { renderPlot } from './plot';
import { loadQuantileDetails, getQuantileDetail, buildFieldGroupMap, type QuantileDetailsIndex, type QuantileDetail } from './quantileDetails';

// 1. Layout
initLayout();

// 2. Store
const { $state, update } = createDashboardStore(DETERMINANTS_DEFAULTS, resolveDeterminants);

// 3. Controls
initControls($state, update);
initTopControls($state, update);

// 4. URL sync
const URL_KEYS: (keyof typeof DETERMINANTS_DEFAULTS & string)[] = [
  'cause', 'race', 'sex', 'quantileField', 'quantileNumber',
  'compareColor', 'compareFacet', 'measure',
  'showCI', 'showLines', 'startZero',
];
syncStoreToURL($state, update, URL_KEYS);

// 5. Render loop with query-key separation
const QUERY_KEYS: (keyof DeterminantsState)[] = [
  'cause', 'race', 'sex', 'quantileField', 'quantileNumber',
  'compareColor', 'compareFacet',
];

let lastData: EnrichedQuantileRow[] = [];
let renderVersion = 0;
let prevQuerySnapshot = '';
let quantileDetails: QuantileDetailsIndex | null = null;

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function querySnapshot(state: DeterminantsState): string {
  return QUERY_KEYS.map(k => String(state[k])).join('\0');
}

// Load quantile details once at startup
loadQuantileDetails().then((index) => {
  quantileDetails = index;
  setQuantileFieldGroups(buildFieldGroupMap(index));
  // Re-emit so the combo box rebuilds with <optgroup> structure
  update({});
  render();
});

$state.subscribe(async (state) => {
  const snap = querySnapshot(state);
  const needsFetch = snap !== prevQuerySnapshot;

  if (needsFetch) {
    prevQuerySnapshot = snap;
    const version = ++renderVersion;
    const data = await fetchData(state);
    if (version !== renderVersion) return; // stale
    lastData = data;

    // Update filter options from the actual query results
    const filterOptions = deriveFilterOptions(state, data);
    if (
      !arraysEqual(state.compareColorFilterOptions, filterOptions.compareColorFilterOptions) ||
      !arraysEqual(state.compareFacetFilterOptions, filterOptions.compareFacetFilterOptions)
    ) {
      update(filterOptions);
      return; // update() will re-trigger this subscribe; render on the next pass
    }
  }

  render();
});

function currentDetail(): QuantileDetail | undefined {
  if (!quantileDetails) return undefined;
  const state = $state.get();
  return getQuantileDetail(quantileDetails, state.quantileField, state.quantileNumber);
}

function render(): void {
  const state = $state.get();
  const filtered = applyPlotFilters(state, lastData);
  renderPlot(state, filtered, currentDetail());
}

// 6. Re-render on resize
const plotEl = document.getElementById('plot');
function clearPlot(): void {
  if (plotEl) plotEl.replaceChildren();
}

if (plotEl) {
  onResize(plotEl, render, 300, clearPlot);
}
