import { initLayout } from '../shared/initLayout';
import { createDashboardStore } from '../shared/state/createStore';
import { syncStoreToURL } from '../shared/state/urlSync';
import { onResize } from '../shared/resizeObserver';
import { DEMOGRAPHICS_DEFAULTS, resolveDemographics, type DemographicsState } from './state';
import { initControls } from './controls';
import { initTopControls } from './topControls';
import { fetchData, applyPlotFilters, deriveFilterOptions, type EnrichedAgeRow } from './query';
import { renderPlot } from './plot';
import { createPlotTooltip, type PlotTooltipField } from '../shared/plotTooltip';
import { COMPARISON_FIELD_LABEL, MEASURE_STYLE } from '../shared/visual';
import { parquetUrl, ageFile } from '../../data/dataManager';
import type { TableInfo, TableFilterSpec } from '../shared/tableFilters';

// 1. Layout
initLayout();

// 2. Store
const { $state, update } = createDashboardStore(DEMOGRAPHICS_DEFAULTS, resolveDemographics);

// 3. Controls
function getTableInfo(): TableInfo {
  const state = $state.get();
  const compAxes = [state.compareBar, state.compareFacet];
  const filters: TableFilterSpec[] = [
    { column: 'cause', value: compAxes.includes('cause') ? '*' : state.cause },
    { column: 'race', value: compAxes.includes('race') ? '*' : state.race },
    { column: 'sex', value: compAxes.includes('sex') ? '*' : state.sex },
    { column: 'ageGroup', value: compAxes.includes('ageGroup') ? '*' : state.ageGroup },
    { column: 'stateFips', value: state.stateFips },
  ];
  return { url: parquetUrl(ageFile(state.year)), filters };
}

initControls($state, update);
initTopControls($state, update, () => lastData as unknown as Record<string, unknown>[], getTableInfo);

// 4. URL sync
const URL_KEYS: (keyof typeof DEMOGRAPHICS_DEFAULTS & string)[] = [
  'year', 'cause', 'race', 'sex', 'ageGroup',
  'stateFips', 'measure', 'compareBar', 'compareFacet', 'showCI',
];
syncStoreToURL($state, update, URL_KEYS, DEMOGRAPHICS_DEFAULTS);

// 5. Render loop with query-key separation
// Only these keys require a data re-fetch; all others are display-only.
const QUERY_KEYS: (keyof DemographicsState)[] = [
  'year', 'cause', 'race', 'sex', 'ageGroup',
  'stateFips', 'compareBar', 'compareFacet',
];

let lastData: EnrichedAgeRow[] = [];
let renderVersion = 0;
let prevQuerySnapshot: string = '';

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function querySnapshot(state: DemographicsState): string {
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

const plotTooltip = createPlotTooltip();

function render(): void {
  const state = $state.get();
  const filtered = applyPlotFilters(state, lastData);
  renderPlot(state, filtered);

  // Restore visibility after render (clearPlot hides it during resize debounce)
  const plotEl = document.getElementById('plot')!;
  plotEl.style.visibility = '';

  // Bind tooltip to bar marks
  const fields: PlotTooltipField[] = [];

  // Show comparison fields first
  for (const comp of [state.compareBar, state.compareFacet] as const) {
    if (comp !== 'none') {
      fields.push({
        label: COMPARISON_FIELD_LABEL[comp] ?? comp,
        value: (row) => String(row[comp] ?? ''),
      });
    }
  }

  // Measure value last
  const measureLabel = MEASURE_STYLE[state.measure].labelShort;
  fields.push({
    label: measureLabel,
    value: (row) => {
      const v = row[state.measure];
      return typeof v === 'number' ? v.toFixed(2) : String(v ?? 'N/A');
    },
  });

  plotTooltip.bind(
    plotEl,
    "g[aria-label='bar'] rect",
    filtered as unknown as Record<string, unknown>[],
    fields,
  );
}

// 6. Re-render on resize — clear the plot immediately so the user sees the
//    resize happening and so the container can reflow without stale SVG dimensions.
//    #plot-container's height is CSS-constrained (calc(100vh - 5rem), max 785px)
//    so the ResizeObserver catches both horizontal and vertical changes.
const plotEl = document.getElementById('plot');
function clearPlot(): void {
  if (plotEl) plotEl.style.visibility = 'hidden';
}

if (plotEl) {
  onResize(plotEl, render, 300, clearPlot);
}
