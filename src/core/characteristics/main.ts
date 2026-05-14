import { initLayout } from '../shared/initLayout';
import { createDashboardStore } from '../shared/state/createStore';
import { syncStoreToURL } from '../shared/state/urlSync';
import { onResize } from '../shared/resizeObserver';
import { CHARACTERISTICS_DEFAULTS, resolveCharacteristics, type CharacteristicsState } from './state';
import { initControls, setQuantileFieldGroups, setQuantileFieldNames } from './controls';
import { initTopControls } from './topControls';
import { fetchData, applyPlotFilters, deriveFilterOptions, type EnrichedQuantileRow } from './query';
import { renderPlot } from './plot';
import {
  loadQuantileDetails, getQuantileDetailForYear, preloadVintageAssignments,
  buildFieldGroupMap, buildFieldNameMap, formatQuantileRange,
  type QuantileDetailsIndex, type QuantileDetail,
} from './quantileDetails';
import { createPlotTooltip, type PlotTooltipField } from '../shared/plotTooltip';
import { COMPARISON_FIELD_LABEL, CHARACTERISTICS_MEASURE_STYLE } from '../shared/visual';
import { parquetUrl, quantileFile } from '../../data/dataManager';
import type { TableInfo, TableFilterSpec } from '../shared/tableFilters';

// 1. Layout
initLayout();

// 2. Store
const { $state, update } = createDashboardStore(CHARACTERISTICS_DEFAULTS, resolveCharacteristics);

// 3. Controls
function getTableInfo(): TableInfo {
  const state = $state.get();
  const compAxes: string[] = [state.compareColor, state.compareFacet];
  const filters: TableFilterSpec[] = [
    { column: 'cause', value: compAxes.includes('cause') ? '*' : state.cause },
    { column: 'race', value: compAxes.includes('race') ? '*' : state.race },
    { column: 'sex', value: compAxes.includes('sex') ? '*' : state.sex },
    { column: 'field_id', value: state.quantileField },
  ];
  return { url: parquetUrl(quantileFile(state.quantileNumber, state.year)), filters };
}

initControls($state, update);
initTopControls($state, update, () => lastData as unknown as Record<string, unknown>[], getTableInfo);

// 4. URL sync
const URL_KEYS: (keyof typeof CHARACTERISTICS_DEFAULTS & string)[] = [
  'cause', 'race', 'sex', 'quantileField', 'quantileNumber', 'year',
  'compareColor', 'compareFacet', 'measure',
  'showCI', 'showLines', 'startZero',
];
syncStoreToURL($state, update, URL_KEYS, CHARACTERISTICS_DEFAULTS);

// 5. Render loop with query-key separation
const QUERY_KEYS: (keyof CharacteristicsState)[] = [
  'cause', 'race', 'sex', 'quantileField', 'quantileNumber', 'year',
  'compareColor', 'compareFacet',
];

let lastData: EnrichedQuantileRow[] = [];
let renderVersion = 0;
let prevQuerySnapshot = '';
let quantileDetails: QuantileDetailsIndex | null = null;

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function querySnapshot(state: CharacteristicsState): string {
  return QUERY_KEYS.map(k => String(state[k])).join('\0');
}

// Load quantile details and vintage assignments at startup
Promise.all([
  loadQuantileDetails(),
  preloadVintageAssignments(CHARACTERISTICS_DEFAULTS.year),
]).then(([index]) => {
  quantileDetails = index;
  setQuantileFieldGroups(buildFieldGroupMap(index));
  setQuantileFieldNames(buildFieldNameMap(index));
  // Re-emit so the combo box rebuilds with <optgroup> structure
  $state.notify();
});

$state.subscribe(async (state) => {
  const snap = querySnapshot(state);
  const needsFetch = snap !== prevQuerySnapshot;

  if (needsFetch) {
    prevQuerySnapshot = snap;
    const version = ++renderVersion;

    // Pre-load vintage assignments for the selected year (async, non-blocking for render)
    preloadVintageAssignments(state.year).then(() => {
      if (version === renderVersion) render();
    });

    const data = await fetchData(state);
    if (version !== renderVersion) return; // stale
    lastData = data;

    // Update filter options from the actual query results
    const filterOptions = deriveFilterOptions(state, data);
    const currentState = $state.get();
    if (
      !arraysEqual(currentState.compareColorFilterOptions, filterOptions.compareColorFilterOptions) ||
      !arraysEqual(currentState.compareFacetFilterOptions, filterOptions.compareFacetFilterOptions)
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
  return getQuantileDetailForYear(quantileDetails, state.quantileField, state.quantileNumber, state.year);
}

const plotTooltip = createPlotTooltip();

const HIGHLIGHT_SELECTORS = [
  "g[aria-label='dot'] :is(circle, path)",
  "g[aria-label='line'] :is(line, path)",
  "g[aria-label='link'] :is(line, path)",
];

function highlightSeries(container: HTMLElement, row: Record<string, unknown> | null): void {
  if (!row) {
    // Restore all opacities
    for (const sel of HIGHLIGHT_SELECTORS) {
      for (const el of container.querySelectorAll<SVGElement>(sel)) {
        el.style.opacity = '';
      }
    }
    return;
  }

  // Get the hovered dot's fill color to identify the series.
  // The activated dot has dataset.origR or dataset.origTransform set by the tooltip.
  const dotEls = container.querySelectorAll<SVGElement>("g[aria-label='dot'] :is(circle, path)");
  let seriesColor: string | null = null;
  for (const el of dotEls) {
    if (el.dataset.origR != null || el.dataset.origTransform != null) {
      seriesColor = el.getAttribute('fill');
      break;
    }
  }

  if (!seriesColor) return;

  for (const sel of HIGHLIGHT_SELECTORS) {
    const groups = new Set<Element>();
    for (const el of container.querySelectorAll<SVGElement>(sel)) {
      const color = el.getAttribute('fill') || el.getAttribute('stroke');
      const matches = color === seriesColor;
      el.style.opacity = matches ? '' : '0.15';
      // Bring matching elements to front within their parent group
      if (matches && el.parentElement) {
        groups.add(el.parentElement);
      }
    }
    // Move matching elements to end of their parent (painted on top)
    for (const parent of groups) {
      for (const el of parent.children) {
        const color = (el as SVGElement).getAttribute('fill') || (el as SVGElement).getAttribute('stroke');
        if (color === seriesColor) {
          parent.appendChild(el);
        }
      }
    }
  }
}

function render(): void {
  const state = $state.get();
  const filtered = applyPlotFilters(state, lastData);
  const detail = currentDetail();
  renderPlot(state, filtered, detail);

  // Restore visibility after render (clearPlot hides it during resize debounce)
  const plotEl = document.getElementById('plot')!;
  plotEl.style.visibility = '';

  // Bind tooltip to dot marks
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
  fields.push({
    label: 'Quantile',
    value: (row) => {
      const q = String(row['quantile_bin'] ?? '');
      if (!detail) return q;
      const idx = parseInt(q, 10) - 1;
      const range = detail.quantileRanges[idx];
      if (!range) return q;
      return `${q} (${formatQuantileRange(range, detail.unit)})`;
    },
  });

  // Measure value last
  const measureLabel = CHARACTERISTICS_MEASURE_STYLE[state.measure].labelShort;
  fields.push({
    label: measureLabel,
    value: (row) => {
      const v = row[state.measure];
      return typeof v === 'number' ? v.toFixed(2) : String(v ?? 'N/A');
    },
  });

  // Observable Plot renders dots as circles or paths (for symbols) inside g[aria-label='dot']
  const useHighlight = state.compareColor !== 'none';

  plotTooltip.bind(
    plotEl,
    "g[aria-label='dot'] :is(circle, path)",
    filtered as unknown as Record<string, unknown>[],
    fields,
    {
      proximity: 14,
      onHover: useHighlight ? (row) => {
        highlightSeries(plotEl, row);
      } : undefined,
    },
  );
}

// 6. Re-render on resize
const plotEl = document.getElementById('plot');
function clearPlot(): void {
  if (plotEl) plotEl.style.visibility = 'hidden';
}

if (plotEl) {
  onResize(plotEl, render, 300, clearPlot);
}
