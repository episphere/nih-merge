import { initLayout } from '../shared/initLayout';
import { createDashboardStore } from '../shared/state/createStore';
import { syncStoreToURL } from '../shared/state/urlSync';
import { onResize } from '../shared/resizeObserver';
import { DETERMINANTS_DEFAULTS, resolveDeterminants, type DeterminantsState } from './state';
import { initControls, setQuantileFieldGroups } from './controls';
import { initTopControls } from './topControls';
import { fetchData, applyPlotFilters, deriveFilterOptions, type EnrichedQuantileRow } from './query';
import { renderPlot } from './plot';
import { loadQuantileDetails, getQuantileDetail, buildFieldGroupMap, formatQuantileRange, type QuantileDetailsIndex, type QuantileDetail } from './quantileDetails';
import { createPlotTooltip, type PlotTooltipField } from '../shared/plotTooltip';
import { COMPARISON_FIELD_LABEL, DETERMINANTS_MEASURE_STYLE } from '../shared/visual';

// 1. Layout
initLayout();

// 2. Store
const { $state, update } = createDashboardStore(DETERMINANTS_DEFAULTS, resolveDeterminants);

// 3. Controls
initControls($state, update);
initTopControls($state, update, () => lastData as unknown as Record<string, unknown>[]);

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

const plotTooltip = createPlotTooltip();

function render(): void {
  const state = $state.get();
  const filtered = applyPlotFilters(state, lastData);
  renderPlot(state, filtered, currentDetail());

  // Bind tooltip to dot marks
  const plotEl = document.getElementById('plot')!;
  const fields: PlotTooltipField[] = [];

  // Show comparison fields first
  for (const comp of [state.compareColor, state.compareFacet] as const) {
    if (comp !== 'none') {
      fields.push({
        label: COMPARISON_FIELD_LABEL[comp] ?? comp,
        value: (row) => String(row[comp] ?? ''),
      });
    }
  }

  // Quantile with range
  const detail = currentDetail();
  fields.push({
    label: 'Quantile',
    value: (row) => {
      const q = String(row['quantile'] ?? '');
      if (!detail) return q;
      const idx = parseInt(q, 10) - 1;
      const range = detail.quantileRanges[idx];
      if (!range) return q;
      return `${q} (${formatQuantileRange(range, detail.unit)})`;
    },
  });

  // Measure value last
  const measureLabel = DETERMINANTS_MEASURE_STYLE[state.measure].labelShort;
  fields.push({
    label: measureLabel,
    value: (row) => {
      const v = row[state.measure];
      return typeof v === 'number' ? v.toFixed(2) : String(v ?? 'N/A');
    },
  });

  // Observable Plot renders dots as circles or paths (for symbols) inside g[aria-label='dot']
  plotTooltip.bind(
    plotEl,
    "g[aria-label='dot'] :is(circle, path)",
    filtered as unknown as Record<string, unknown>[],
    fields,
  );
}

// 6. Re-render on resize
const plotEl = document.getElementById('plot');
function clearPlot(): void {
  if (plotEl) plotEl.replaceChildren();
}

if (plotEl) {
  onResize(plotEl, render, 300, clearPlot);
}
