import * as d3 from 'd3';
import type { ColorConfig } from './query';
import type { MapsState, MapsMeasure } from './state';

const OUTLIER_COLOR = '#3d3d3d';
const N_GRAD = 16;

const MEASURE_LABEL: Record<MapsMeasure, string> = {
  ageAdjustedRate: 'Age-Adjusted Rate (per 100,000)',
  crudeRate: 'Crude Rate (per 100,000)',
  deaths: 'Deaths',
  population: 'Population',
};

/** Format numbers the same way the old legend did. */
function numberFormat(d: number): string {
  if (d < 1000) {
    return d % 1 ? d3.format('.1f')(d) : d3.format('.0f')(d);
  }
  return d3.format('.2s')(d);
}

/**
 * Renders a color ramp legend matching the original EpiTracker design.
 * Port of colorRampLegendPivot / colorRampLegend / outlierLabel from helper.js.
 */
export function renderColorLegend(
  container: HTMLElement,
  colorConfig: ColorConfig | null,
  state: MapsState,
): void {
  if (!colorConfig || !colorConfig.valid) {
    container.replaceChildren();
    return;
  }

  const { scheme, domain, pivot, reverse } = colorConfig;
  const excludeExtremes = state.colorExcludeExtremes;

  // Build color scale (same as mapPlot.ts)
  let colorDomain = [...domain] as [number, number];
  if (pivot != null) {
    const maxSide = Math.max(pivot - colorDomain[0], colorDomain[1] - pivot);
    colorDomain = [pivot - maxSide, pivot + maxSide];
  }

  const interpolator = (d3 as Record<string, unknown>)[
    'interpolate' + scheme
  ] as (t: number) => string;
  const colorScale = d3
    .scaleSequential(interpolator)
    .domain(reverse ? [colorDomain[1], colorDomain[0]] : colorDomain);

  // Tick values
  const tickValues = pivot != null ? [domain[0], pivot, domain[1]] : [domain[0], domain[1]];

  // SVG size — label variant (50px tall), shrink for outlier swatch
  const label = MEASURE_LABEL[state.measure];
  const outlierCount = excludeExtremes ? 1 : 0;
  const size: [number, number] = [370 - outlierCount * 45, 50];
  const startY = 20;
  const margin = 20;

  // --- SVG ---
  const gradientId = 'ramp-gradient-' + Math.floor(Math.random() * 10000000);

  const svg = d3.create('svg').attr('width', size[0]).attr('height', size[1]);

  const defs = svg.append('defs');
  const gradient = defs
    .append('linearGradient')
    .attr('id', gradientId)
    .attr('x1', '0%')
    .attr('x2', '100%');

  const pScale = d3.scaleLinear().domain([0, N_GRAD]).range(domain);

  gradient
    .append('stop')
    .attr('class', 'start')
    .attr('offset', '0%')
    .attr('stop-color', colorScale(domain[0]));

  for (let i = 1; i < N_GRAD - 1; i++) {
    gradient
      .append('stop')
      .attr('offset', `${(100 * i) / N_GRAD}%`)
      .attr('stop-color', colorScale(pScale(i)));
  }

  gradient
    .append('stop')
    .attr('class', 'end')
    .attr('offset', '100%')
    .attr('stop-color', colorScale(domain[1]));

  // Gradient rect
  svg
    .append('rect')
    .attr('x', margin)
    .attr('y', startY)
    .attr('width', size[0] - margin * 2)
    .attr('height', size[1] - 19 - startY)
    .attr('fill', `url(#${gradientId})`);

  // Axis ticks
  const scale = d3
    .scaleLinear()
    .domain(domain)
    .range([0, size[0] - margin * 2]);

  const axis = d3
    .axisBottom(scale)
    .tickValues(tickValues)
    .tickSize(size[1] - 15 - startY)
    .tickSizeOuter(0)
    .tickFormat((d) => numberFormat(d as number));

  svg
    .append('g')
    .attr('transform', `translate(${margin},${startY})`)
    .style('font-size', 14)
    .style('color', '#424242')
    .style('stroke-width', '1px')
    .call(axis);

  svg.selectAll('.tick').selectAll('line').attr('stroke', '#424242');

  // Label text above the gradient
  svg
    .append('g')
    .style('font-family', 'sans-serif')
    .style('font-size', 14)
    .append('text')
    .attr('x', margin)
    .attr('y', 15)
    .text(label);

  // Shift middle tick text when pivot is very close to 0% of range
  if (tickValues.length === 3) {
    const percent = (tickValues[1] * 100) / (tickValues[2] - tickValues[0]);
    const middleTickValue = Math.trunc(tickValues[1]);

    if (percent < 5) {
      svg
        .selectAll('.tick')
        .selectAll('text')
        .filter(function () {
          const text = +(d3.select(this).text().replaceAll(',', ''));
          return text >= middleTickValue - 10 && text <= middleTickValue + 10;
        })
        .attr(
          'transform',
          `translate(${Math.trunc(tickValues[0].toString().length * 8)})`,
        );
    }
  }

  // --- Assemble legend div ---
  const legendDiv = document.createElement('div');
  legendDiv.style.display = 'flex';
  legendDiv.style.alignItems = 'end';

  legendDiv.appendChild(svg.node()!);

  if (excludeExtremes) {
    legendDiv.appendChild(outlierLabel(OUTLIER_COLOR));
  }

  container.replaceChildren(legendDiv);
}

/** Creates the small "Extreme" outlier swatch SVG (same as old helper.js). */
function outlierLabel(color: string): SVGSVGElement {
  const svg = d3.create('svg').attr('width', 58).attr('height', 40);

  const rectWidth = 16;
  const rectHeight = 12;

  svg
    .append('rect')
    .attr('x', 29 - rectWidth / 2)
    .attr('y', 10)
    .attr('width', rectWidth)
    .attr('height', rectHeight)
    .attr('fill', color)
    .attr('rx', 3)
    .attr('ry', 3);

  svg
    .append('text')
    .attr('x', 30)
    .attr('y', 37)
    .text('Extreme')
    .attr('fill', 'rgb(66, 66, 66)')
    .attr('text-anchor', 'middle')
    .style('font-size', 14)
    .style('font-family', 'sans-serif');

  return svg.node()!;
}
