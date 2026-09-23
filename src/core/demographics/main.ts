import { initLayout } from '../shared/initLayout';
import { createDashboardStore } from '../shared/state/createStore';
import { syncStoreToURL } from '../shared/state/urlSync';
import { onResize } from '../shared/resizeObserver';
import { DEMOGRAPHICS_DEFAULTS, resolveDemographics, type DemographicsState } from './state';
import { initControls } from './controls';
import { initTopControls } from './topControls';
import { fetchData, applyPlotFilters, deriveFilterOptions, type EnrichedAgeRow } from './query';
import { renderPlot } from './plot';
import {
  createPlotTooltip, MORTALITY_TOOLTIP_FIELDS, type PlotTooltipField,
} from '../shared/plotTooltip';
import { COMPARISON_FIELD_LABEL, MEASURE_STYLE } from '../shared/visual';
import type { TableView } from '../shared/tableView';

// 1. Layout
initLayout();

// 2. Store
const { $state, update } = createDashboardStore(DEMOGRAPHICS_DEFAULTS, resolveDemographics);

// 3. Controls
function getTableView(): TableView {
  const state = $state.get();
  return {
    key: `${querySnapshot(state)}\0${state.measure}\0${tableDataVersion}`,
    rows: lastData.map((row) => ({ year: state.year, ...row })) as unknown as Record<string, unknown>[],
    subtitle: document.getElementById('title')?.textContent ?? '',
    presentation: {
      fixedColumns: ['year', 'stateFips', 'cause', 'race', 'sex', 'ageGroup'],
      activeMeasure: state.measure,
      defaultNumericColumns: ['deaths', 'population', state.measure],
      exportFileStem: 'nih-merge-demographics-table',
      aliases: {
        columns: {
          year: 'Year', stateFips: 'State FIPS', cause: 'Cancer Site',
          race: 'Race/Ethnicity', sex: 'Sex', ageGroup: 'Age Group',
          deaths: 'Deaths', population: 'Population', crudeRate: 'Crude Rate',
          ageAdjustedRate: 'Age-Adjusted Rate', crudeRateCiLower: 'Crude Rate CI Lower',
          crudeRateCiUpper: 'Crude Rate CI Upper', ageAdjustedRateCiLower: 'Age-Adjusted Rate CI Lower',
          ageAdjustedRateCiUpper: 'Age-Adjusted Rate CI Upper',
        },
      },
    },
  };
}

initControls($state, update);
initTopControls($state, update, () => lastData as unknown as Record<string, unknown>[], getTableView);

// 4. URL sync
const URL_KEYS: (keyof typeof DEMOGRAPHICS_DEFAULTS & string)[] = [
  'year', 'cause', 'race', 'sex', 'ageGroup',
  'stateFips', 'measure', 'compareBar', 'compareFacet', 'showCI', 'showSuppressed',
];
syncStoreToURL($state, update, URL_KEYS, DEMOGRAPHICS_DEFAULTS);

// 5. Render loop with query-key separation
// Only these keys require a data re-fetch; all others are display-only.
const QUERY_KEYS: (keyof DemographicsState)[] = [
  'year', 'cause', 'race', 'sex', 'ageGroup',
  'stateFips', 'compareBar', 'compareFacet',
];

let lastData: EnrichedAgeRow[] = [];
let tableDataVersion = 0;
let renderVersion = 0;
let prevQuerySnapshot: string = '';
let hasCompletedInitialFetch = false;

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
    document.getElementById('btn-table')?.setAttribute('disabled', '');
    prevQuerySnapshot = snap;
    const version = ++renderVersion;
    const data = await fetchData(state);
    if (version !== renderVersion) return; // stale
    lastData = data;
    tableDataVersion++;
    hasCompletedInitialFetch = true;
    document.getElementById('btn-table')?.removeAttribute('disabled');

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
  // Resize observers may fire while DuckDB is still loading the first file.
  // An empty array is not a real no-data result until that query completes.
  if (!hasCompletedInitialFetch) return;

  const state = $state.get();
  const filtered = applyPlotFilters(state, lastData);
  const plotEl = document.getElementById('plot')!;
  plotEl.setAttribute('aria-busy', 'false');
  renderPlot(state, filtered);

  // Restore visibility after render (clearPlot hides it during resize debounce)
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

  fields.push(...MORTALITY_TOOLTIP_FIELDS);

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
