import type { BreakdownsState } from './state';
import type { EnrichedAgeRow } from './query';
import { MEASURE_STYLE, COMPARISON_FIELD_LABEL } from '../shared/visual';
import { fipsName } from '../shared/fips';

// --- Title generation ---

export function generateTitle(state: BreakdownsState): string {
  const measure = MEASURE_STYLE[state.measure].label;

  const comparisons = [state.compareBar, state.compareFacet]
    .filter(c => c !== 'none')
    .map(c => (COMPARISON_FIELD_LABEL[c] ?? c).toLowerCase());

  let title = `US ${measure}`;
  if (comparisons.length > 0) {
    title += ' by ' + comparisons.join(' and ');
  }

  const filters: string[] = [state.year];
  if (state.cause !== 'Total') filters.push(state.cause);
  if (state.race !== 'Total') filters.push(state.race);
  if (state.sex !== 'Total') filters.push(state.sex);
  if (state.ageGroup !== 'Total') filters.push(state.ageGroup);
  if (state.stateFips !== 'Total') filters.push(fipsName(state.stateFips));

  if (filters.length > 0) {
    title += ' | ' + filters.join(', ');
  }

  return title;
}

// --- Stub render ---

export function renderPlot(state: BreakdownsState, data: EnrichedAgeRow[]): void {
  const plotEl = document.getElementById('plot')!;
  const titleEl = document.getElementById('title')!;

  titleEl.textContent = generateTitle(state);

  if (data.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'grid-row flex-align-center flex-justify-center height-full';
    msg.textContent = 'No data available for current selection.';
    plotEl.replaceChildren(msg);
    return;
  }

  const summary = {
    rowCount: data.length,
    compareBar: state.compareBar,
    compareFacet: state.compareFacet,
    measure: state.measure,
    sampleRows: data.slice(0, 5),
  };

  const pre = document.createElement('pre');
  pre.style.fontSize = '12px';
  pre.style.overflow = 'auto';
  pre.style.maxHeight = '500px';
  pre.textContent = JSON.stringify(summary, null, 2);
  plotEl.replaceChildren(pre);
}
