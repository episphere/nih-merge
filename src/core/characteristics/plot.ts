import * as Plot from '@observablehq/plot';
import * as d3 from 'd3';
import type { CharacteristicsState, CharacteristicsMeasure, ComparisonField } from './state';
import type { EnrichedQuantileRow } from './query';
import type { Race, Sex } from '../../data/types';
import {
  CHARACTERISTICS_MEASURE_STYLE, COMPARISON_FIELD_LABEL, QUANTILE_NAME,
  RACE_STYLE, SEX_STYLE, PALETTE,
} from '../shared/visual';
import type { QuantileDetail } from './quantileDetails';
import { formatQuantileRange } from './quantileDetails';

// --- Title generation ---

export function generateTitle(state: CharacteristicsState, detail: QuantileDetail | undefined): string {
  const measure = CHARACTERISTICS_MEASURE_STYLE[state.measure].label;
  const fieldLabel = detail?.name ?? state.quantileField;

  const comparisons = [state.compareColor, state.compareFacet]
    .filter(c => c !== 'none')
    .map(c => (COMPARISON_FIELD_LABEL[c] ?? c).toLowerCase());

  let title = `US ${measure.toLowerCase()}`;
  title += ` by ${QUANTILE_NAME[state.quantileNumber] ?? `${state.quantileNumber}-quantile`}`;
  title += ` of county-level ${fieldLabel.toLowerCase()}`;

  if (comparisons.length > 0) {
    title += ', by ' + comparisons.join(' and ');
  }

  const filters: string[] = [state.year];
  if (state.cause !== 'All') filters.push(state.cause);
  if (state.race !== 'All') filters.push(state.race);
  if (state.sex !== 'All') filters.push(state.sex);

  title += ' | ' + filters.join(', ');

  return title;
}

// --- Color and symbol helpers ---

const DEFAULT_DOT_COLOR = PALETTE.blue;

function dotFill(field: ComparisonField | 'none'): ((d: EnrichedQuantileRow) => string) | string {
  if (field === 'race') return (d) => RACE_STYLE[d.race as Race].color;
  if (field === 'sex') return (d) => SEX_STYLE[d.sex as Sex].color;
  return DEFAULT_DOT_COLOR;
}

function dotSymbol(field: ComparisonField | 'none'): ((d: EnrichedQuantileRow) => string) | string {
  if (field === 'race') return (d) => RACE_STYLE[d.race as Race].symbol;
  if (field === 'sex') return (d) => SEX_STYLE[d.sex as Sex].symbol;
  return 'circle';
}

function seriesKey(field: ComparisonField | 'none'): ((d: EnrichedQuantileRow) => string) | undefined {
  if (field === 'race') return (d) => d.race as string;
  if (field === 'sex') return (d) => d.sex as string;
  return undefined;
}

/** CI field names for the active measure. */
function ciFields(measure: CharacteristicsMeasure): { lower: keyof EnrichedQuantileRow; upper: keyof EnrichedQuantileRow } | null {
  switch (measure) {
    case 'crudeRate':
      return { lower: 'crudeRateCiLower', upper: 'crudeRateCiUpper' };
    case 'ageAdjustedRate':
      return { lower: 'ageAdjustedRateCiLower', upper: 'ageAdjustedRateCiUpper' };
    case 'ageAdjustedRateRatioRefLow':
      return { lower: 'ageAdjustedRateRatioRefLowCiLower', upper: 'ageAdjustedRateRatioRefLowCiUpper' };
    case 'ageAdjustedRateRatioRefHigh':
      return { lower: 'ageAdjustedRateRatioRefHighCiLower', upper: 'ageAdjustedRateRatioRefHighCiUpper' };
    case 'crudeRateRatioRefLow':
      return { lower: 'crudeRateRatioRefLowCiLower', upper: 'crudeRateRatioRefLowCiUpper' };
    case 'crudeRateRatioRefHigh':
      return { lower: 'crudeRateRatioRefHighCiLower', upper: 'crudeRateRatioRefHighCiUpper' };
    default:
      return null;
  }
}

// --- Layout ---

const MIN_HEIGHT = 450;
const FONT_SIZE = '14px';

function parseQuantileIndex(q: string | number): number {
  return typeof q === 'number' ? q : parseInt(q, 10);
}

// --- Legend ---

function buildLegend(state: CharacteristicsState, data: EnrichedQuantileRow[]): HTMLElement | null {
  if (state.compareColor === 'none') return null;

  const field = state.compareColor;
  const values = [...new Set(data.map(d => d[field as keyof EnrichedQuantileRow] as string))].sort();

  const container = document.createElement('div');
  container.className = 'epi-legend';
  container.style.display = 'flex';
  container.style.flexWrap = 'wrap';
  container.style.justifyContent = 'center';
  container.style.gap = '12px';
  container.style.padding = '8px 0';

  for (const value of values) {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '4px';

    const swatch = document.createElement('span');
    swatch.style.width = '12px';
    swatch.style.height = '12px';
    swatch.style.borderRadius = '50%';
    swatch.style.display = 'inline-block';

    if (field === 'race') {
      swatch.style.backgroundColor = RACE_STYLE[value as Race].color;
    } else if (field === 'sex') {
      swatch.style.backgroundColor = SEX_STYLE[value as Sex].color;
    }

    const label = document.createElement('span');
    label.style.fontSize = '12px';
    if (field === 'race') {
      label.textContent = RACE_STYLE[value as Race]?.labelShort ?? value;
    } else {
      label.textContent = value;
    }

    item.appendChild(swatch);
    item.appendChild(label);
    container.appendChild(item);
  }

  return container;
}

// --- Render ---

export function renderPlot(
  state: CharacteristicsState,
  data: EnrichedQuantileRow[],
  detail: QuantileDetail | undefined,
): void {
  const plotEl = document.getElementById('plot')!;
  const titleEl = document.getElementById('title')!;
  const sourceEl = document.getElementById('plot-source')!;

  titleEl.textContent = generateTitle(state, detail);
  sourceEl.textContent = detail
    ? `County-level measure source: ${detail.source}, ${detail.dataYears}`
    : '';

  if (data.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'grid-row flex-align-center flex-justify-center height-full';
    msg.textContent = 'No data available for current selection.';
    plotEl.replaceChildren(msg);
    return;
  }

  const { compareColor, compareFacet, measure, showCI, showLines, startZero } = state;
  const yField = measure;
  const fxField = compareFacet !== 'none' ? compareFacet : null;

  // Quantile domain sorted numerically
  const quantileDomain = [...new Set(data.map(d => d.quantile_bin))].sort(
    (a, b) => parseQuantileIndex(a) - parseQuantileIndex(b),
  );

  const fxDomain = fxField
    ? [...new Set(data.map(d => d[fxField] as string))].sort()
    : null;

  // Tick labels from quantile details
  const tickLabels: Record<string, string> = {};
  if (detail) {
    for (let i = 0; i < quantileDomain.length; i++) {
      const range = detail.quantileRanges[i];
      if (range) {
        tickLabels[quantileDomain[i]] = formatQuantileRange(range, detail.unit);
      }
    }
  }

  const xTickFormat = (v: string) => tickLabels[v] ?? v;

  // X-axis label
  const fieldLabel = detail?.name ?? state.quantileField;
  const unitLabel = detail?.unit ? ` (${detail.unit})` : '';
  const xLabel = `${fieldLabel}${unitLabel}`;

  // Height
  const height = Math.max(MIN_HEIGHT, plotEl.clientHeight);

  // Margins
  const marginTop = fxField ? 80 : 50;
  const marginBottom = 150;
  const marginLeft = 130;
  const marginRight = 20;

  // Width
  const containerWidth = plotEl.clientWidth;
  const nFacets = fxDomain ? fxDomain.length : 1;
  // The -1 offset prevents a ResizeObserver loop
  const plotWidth = Math.max(containerWidth-1, nFacets * 300);

  // Y domain
  const ci = ciFields(measure);
  let yMin: number;
  let yMax: number;

  if (showCI && ci) {
    yMin = d3.min(data, d => d[ci.lower] as number) ?? 0;
    yMax = d3.max(data, d => d[ci.upper] as number) ?? 0;
  } else {
    yMin = d3.min(data, d => d[yField as keyof EnrichedQuantileRow] as number) ?? 0;
    yMax = d3.max(data, d => d[yField as keyof EnrichedQuantileRow] as number) ?? 0;
  }

  const yDomain: [number, number] = [startZero ? 0 : yMin * 0.9, yMax];

  // Facet tick format
  const fxTickFmt = fxField === 'race'
    ? (v: string) => RACE_STYLE[v as Race]?.labelShort ?? v
    : undefined;

  // Marks
  const marks: Plot.Markish[] = [];

  const colorFn = dotFill(compareColor);
  const symbolFn = dotSymbol(compareColor);
  const strokeFn = typeof colorFn === 'function' ? colorFn : undefined;
  const seriesFn = seriesKey(compareColor);

  data.sort((a,b) => Number(a.quantile_bin) - Number(b.quantile_bin));

  // Optional lines connecting quantile points
  if (showLines && seriesFn) {
    marks.push(Plot.line(data, {
       x: 'quantile_bin',
      y: yField as string,
      stroke: colorFn as never,
      fx: fxField ?? undefined,
      z: seriesFn as never,
      strokeDasharray: '3 4',
      strokeWidth: 1.5,
    }));
  } else if (showLines && !seriesFn) {
    marks.push(Plot.line(data, {
      x: 'quantile_bin',
      y: yField as string,
      stroke: DEFAULT_DOT_COLOR,
      fx: fxField ?? undefined,
      strokeDasharray: '3 4',
      strokeWidth: 1.5,
    }));
  }

  // Confidence interval marks (vertical links with horizontal caps)
  if (showCI && ci) {
    const capHalf = 4; // half-width of cap in pixels
    marks.push(Plot.link(data, {
      x1: 'quantile_bin',
      x2: 'quantile_bin',
      y1: ci.lower as string,
      y2: ci.upper as string,
      fx: fxField ?? undefined,
      stroke: strokeFn as never ?? '#333',
      strokeWidth: 1,
      render: (index, scales, values, dimensions, context, next) => {
        const g = next!(index, scales, values, dimensions, context);
        if (g) {
          // link renders <path> elements with "M x1,y1 L x2,y2" or similar
          const paths = g.querySelectorAll('path');
          for (const el of paths) {
            const d = el.getAttribute('d');
            if (!d) continue;
            // Parse "M x1,y1L x2,y2" or "M x1,y1 L x2,y2"
            const match = d.match(/M\s*([\d.e+-]+)[,\s]([\d.e+-]+)\s*L\s*([\d.e+-]+)[,\s]([\d.e+-]+)/i);
            if (!match) continue;
            const x1 = +match[1], y1 = +match[2];
            const x2 = +match[3], y2 = +match[4];
            const stroke = el.getAttribute('stroke') || '#333';
            const cx = (x1 + x2) / 2;
            for (const y of [y1, y2]) {
              const cap = document.createElementNS('http://www.w3.org/2000/svg', 'line');
              cap.setAttribute('x1', String(cx - capHalf));
              cap.setAttribute('x2', String(cx + capHalf));
              cap.setAttribute('y1', String(y));
              cap.setAttribute('y2', String(y));
              cap.setAttribute('stroke', stroke);
              cap.setAttribute('stroke-width', '1');
              g.appendChild(cap);
            }
          }
        }
        return g;
      },
    }));
  }

  // Dot marks
  marks.push(Plot.dot(data, {
    x: 'quantile_bin',
    y: yField as string,
    fill: colorFn as never,
    symbol: symbolFn as never,
    fx: fxField ?? undefined,
    r: 5,
  }));

  // Plot options
  const plotOptions: Plot.PlotOptions = {
    width: plotWidth,
    height,
    style: { fontSize: FONT_SIZE },
    x: {
      label: xLabel,
      tickFormat: xTickFormat,
      tickRotate: -45,
      labelOffset: 120,
      domain: quantileDomain,
      type: 'point',
    },
    y: {
      grid: true,
      label: CHARACTERISTICS_MEASURE_STYLE[measure].plotLabel,
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

  // Render
  const svg = Plot.plot(plotOptions);
  svg.style.minWidth = `${plotWidth}px`;
  svg.style.flexGrow = '1';
  svg.style.flexShrink = '0';

  const wrapper = document.createElement('div');
  wrapper.style.width = '100%';
  wrapper.appendChild(svg);

  // Legend
  const legend = buildLegend(state, data);
  if (legend) {
    wrapper.appendChild(legend);
  }

  plotEl.replaceChildren(wrapper);
  svg.removeAttribute('viewBox');
}
