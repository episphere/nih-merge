import * as Plot from '@observablehq/plot';
import * as d3 from 'd3';
import type { DemographicsState, ComparisonField, Measure } from './state';
import type { EnrichedAgeRow } from './query';
import type { Race, Sex } from '../../data/types';
import {
  MEASURE_STYLE, COMPARISON_FIELD_LABEL,
  RACE_STYLE, SEX_STYLE, PALETTE,
} from '../shared/visual';
import { fipsName } from '../shared/fips';

// --- Title generation ---

export function generateTitle(state: DemographicsState): string {
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

// --- Color and label helpers ---

const DEFAULT_BAR_COLOR = PALETTE.blue;

function barFill(field: ComparisonField | 'none'): ((d: EnrichedAgeRow) => string) | string {
  if (field === 'race') return (d) => RACE_STYLE[d.race as Race].color;
  if (field === 'sex') return (d) => SEX_STYLE[d.sex as Sex].color;
  return DEFAULT_BAR_COLOR;
}

function tickFormat(field: ComparisonField | 'none'): ((v: string) => string) | undefined {
  if (field === 'race') return (v) => RACE_STYLE[v as Race]?.labelShort ?? v;
  return undefined;
}

/** CI field names for the active measure. */
function ciFields(measure: Measure): { lower: keyof EnrichedAgeRow; upper: keyof EnrichedAgeRow } {
  if (measure === 'crudeRate') {
    return { lower: 'crudeRateCiLower', upper: 'crudeRateCiUpper' };
  }
  return { lower: 'ageAdjustedRateCiLower', upper: 'ageAdjustedRateCiUpper' };
}

// --- Layout sizing ---

const MIN_HEIGHT = 450;
const FONT_SIZE = '14px';

/** Approximate the rendered height of a rotated tick label (used for margin calculation). */
function estimateLabelHeight(labels: string[], angleDeg = 45): number {
  const charWidth = 7;   // approximate width per character at ~14px
  const charHeight = 14;  // approximate line height
  const angleRad = (angleDeg * Math.PI) / 180;
  let maxHeight = 0;
  for (const label of labels) {
    const lines = label.split('\n');
    const longestLine = d3.max(lines, l => l.length) ?? 0;
    const textWidth = longestLine * charWidth;
    const textHeight = lines.length * charHeight;
    const rotatedH = Math.abs(textWidth * Math.sin(angleRad)) + Math.abs(textHeight * Math.cos(angleRad));
    maxHeight = Math.max(maxHeight, rotatedH);
  }
  return maxHeight;
}

// --- Render ---

export function renderPlot(state: DemographicsState, data: EnrichedAgeRow[]): void {
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

  const { compareBar, compareFacet, measure, showCI } = state;
  const yField = measure;
  const xField = compareBar !== 'none' ? compareBar : null;
  const fxField = compareFacet !== 'none' ? compareFacet : null;

  // Domains
  const xDomain = xField
    ? [...new Set(data.map(d => d[xField] as string))].sort()
    : ['All'];
  const fxDomain = fxField
    ? [...new Set(data.map(d => d[fxField] as string))].sort()
    : null;

  // Tick labels for measuring
  const xTickFmt = tickFormat(compareBar);
  const xLabels = xDomain.map(v => xTickFmt ? xTickFmt(v) : v);
  const labelHeight = estimateLabelHeight(xLabels);

  const fxTickFmt = tickFormat(compareFacet);

  const height = Math.max(MIN_HEIGHT, plotEl.clientHeight-1);

  // Margins (computed first since they affect available bar area).
  const marginTop = fxField ? 80 : 50;
  const marginBottom = 50 + labelHeight;
  const baseMarginLeft = Math.max(90, labelHeight);
  const baseMarginRight = 20;
  const fixedMargins = baseMarginLeft + baseMarginRight;

  // Width: clamp the *per-bar* width between a floor and ceiling, then derive
  // the total plot width. This keeps bars consistent regardless of how many
  // there are, since fixed margins don't eat into the per-bar budget.
  const containerWidth = plotEl.clientWidth;
  const nBars = xDomain.length;
  const nFacets = fxDomain ? fxDomain.length : 1;
  const MIN_BAR_WIDTH = 30;
  const MAX_BAR_WIDTH = 55;
  const availableForBars = (containerWidth - fixedMargins) / nFacets;
  const naturalBarWidth = availableForBars / nBars;
  const barWidth = Math.min(Math.max(MIN_BAR_WIDTH, naturalBarWidth), MAX_BAR_WIDTH);
  const plotWidth = barWidth * nBars * nFacets + fixedMargins;

  // Center the chart when it's narrower than the container.
  const extraSpace = Math.max(0, containerWidth - plotWidth);
  const centering = extraSpace / 2;
  const marginLeft = baseMarginLeft + centering;
  const marginRight = baseMarginRight + centering;

  // Y domain — extend to CI upper bound if showing CIs
  const ci = ciFields(measure);
  const yMax = showCI
    ? d3.max(data, d => d[ci.upper] as number)
    : d3.max(data, d => d[yField] as number);
  const yDomain: [number, number] = [0, yMax ?? 0];

  // Marks
  const marks: Plot.Markish[] = [];

  // If no x comparison, add a constant "All" column to data for plotting
  const plotData = xField
    ? data
    : data.map(d => ({ ...d, _x: 'All' }));
  const xChannel = xField ?? '_x';

  // Bar mark
  marks.push(Plot.barY(plotData, {
    x: xChannel,
    y: yField,
    fill: xField ? barFill(compareBar) as never : DEFAULT_BAR_COLOR,
    fx: fxField ?? undefined,
  }));

  // Confidence interval marks
  if (showCI) {
    const ciStyle = { stroke: '#121212', strokeWidth: 1 };
    marks.push(Plot.ruleX(plotData, {
      x: xChannel,
      y1: ci.lower,
      y2: ci.upper,
      fx: fxField ?? undefined,
      ...ciStyle,
    }));
    marks.push(Plot.tickY(plotData, {
      x: xChannel,
      y: ci.lower,
      fx: fxField ?? undefined,
      stroke: '#121212',
      inset: 10,
    }));
    marks.push(Plot.tickY(plotData, {
      x: xChannel,
      y: ci.upper,
      fx: fxField ?? undefined,
      stroke: '#121212',
      inset: 10,
    }));
  }

  // Render the SVG at the full container width (or plotWidth if wider, for scroll).
  // The centering margins push the chart area to the visual center.
  const svgWidth = Math.max(containerWidth, plotWidth);

  // Plot options
  const plotOptions: Plot.PlotOptions = {
    width: svgWidth,
    height,
    style: { fontSize: FONT_SIZE },
    x: {
      label: xField ? COMPARISON_FIELD_LABEL[xField] ?? '' : '',
      tickFormat: xTickFmt ?? undefined,
      tickRotate: -45,
      labelOffset: 30 + labelHeight,
      domain: xDomain,
    },
    y: {
      grid: true,
      label: MEASURE_STYLE[measure].plotLabel,
      domain: yDomain,
      nice: true,
      labelAnchor: 'center',
      labelArrow: 'none',
      labelOffset: 90,
    },
    marginLeft,
    marginRight,
    marginTop,
    marginBottom,
    marks,
  };

  // Faceting
  if (fxField && fxDomain) {
    plotOptions.fx = {
      tickFormat: fxTickFmt ?? undefined,
      labelOffset: 45,
      domain: fxDomain,
      label: COMPARISON_FIELD_LABEL[fxField] ?? null,
    };
  }

  // Render — match the old layout pattern:
  // 1. SVG gets minWidth so it won't shrink below its natural size
  // 2. Wrapper div with width:100% constrains layout within the container
  // 3. viewBox removed AFTER DOM insertion so the SVG renders at pixel scale
  const svg = Plot.plot(plotOptions);
  svg.style.minWidth = `${svgWidth}px`;
  svg.style.flexGrow = '1';
  svg.style.flexShrink = '0';

  const wrapper = document.createElement('div');
  wrapper.style.width = '100%';
  wrapper.appendChild(svg);

  plotEl.replaceChildren(wrapper);
  svg.removeAttribute('viewBox');
}
