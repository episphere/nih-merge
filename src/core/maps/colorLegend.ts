import * as d3 from 'd3';
import type { ColorConfig } from './query';
import type { MapsState, MapsMeasure } from './state';

const MEASURE_LABEL: Record<MapsMeasure, string> = {
  ageAdjustedRate: 'Age-Adjusted Rate (per 100,000)',
  crudeRate: 'Crude Rate (per 100,000)',
  deaths: 'Deaths',
  population: 'Population',
};

// --- Generic color legend renderer ---

interface ColorLegendOptions {
  container: HTMLElement;
  domain: [number, number];
  scheme: string | ((t: number) => string) | string[];
  label?: string;
  pivot?: number | null;
  reverse?: boolean;
  lowOutlierColor?: string | false;
  highOutlierColor?: string | false;
  stripedOutliers?: boolean;
  width?: number;
  height?: number;
}

function renderColorLegendGeneric(options: ColorLegendOptions): void {
  let {
    container,
    domain,
    scheme,
    label = '',
    pivot = null,
    reverse = false,
    lowOutlierColor = false,
    highOutlierColor = false,
    stripedOutliers = false,
    width = 400,
    height = 50,
  } = options;

  if (!domain || !scheme) {
    container.replaceChildren();
    return;
  }

  const LAYOUT = {
    labelY: 15,
    rampTop: 20,
    rampBottom: height - 19,
    tickLabelY: height - 6,
    sideMargin: 20,
    swatchWidth: 16,
    swatchGutter: 12,
    swatchRadius: 3,
    gradientStops: 16,
    fontSize: 14,
    fontFamily: 'sans-serif',
    textColor: '#424242',
    stripeSpacing: 4,
    stripeWidth: 1.5,
    stripeColor: '#ffffff',
  };
  const rampHeight = LAYOUT.rampBottom - LAYOUT.rampTop;

  // Helpers
  const formatNumber = (d: number): string => {
    if (d < 1000) {
      return d % 1 ? d3.format('.1f')(d) : d3.format('.0f')(d);
    }
    return d3.format('.2s')(d);
  };

  const resolveInterpolator = (
    s: string | ((t: number) => string) | string[],
  ): ((t: number) => string) => {
    if (Array.isArray(s)) {
      const scale = d3
        .scaleLinear<string>()
        .domain(s.map((_, i) => i / (s.length - 1)))
        .range(s)
        .interpolate(d3.interpolateRgb as unknown as (a: string, b: string) => (t: number) => string);
      return (t: number) => scale(t);
    }
    if (typeof s === 'string') {
      return (d3 as Record<string, unknown>)['interpolate' + s] as (t: number) => string;
    }
    return s;
  };

  const measureTextWidth = (text: string): number => {
    if (typeof document === 'undefined') {
      return text.length * LAYOUT.fontSize * 0.6;
    }
    const svgNS = 'http://www.w3.org/2000/svg';
    const tempSvg = document.createElementNS(svgNS, 'svg');
    tempSvg.setAttribute('width', '0');
    tempSvg.setAttribute('height', '0');
    tempSvg.style.position = 'absolute';
    tempSvg.style.visibility = 'hidden';
    const tempText = document.createElementNS(svgNS, 'text');
    tempText.style.fontFamily = LAYOUT.fontFamily;
    tempText.style.fontSize = LAYOUT.fontSize + 'px';
    tempText.textContent = text;
    tempSvg.appendChild(tempText);
    document.body.appendChild(tempSvg);
    const w = tempText.getComputedTextLength();
    document.body.removeChild(tempSvg);
    return w;
  };

  // Color scale
  let colorDomain = [...domain] as [number, number];
  if (pivot !== null) {
    const maxSide = Math.max(pivot - colorDomain[0], colorDomain[1] - pivot);
    colorDomain = [pivot - maxSide, pivot + maxSide];
  }

  const colorScale = d3
    .scaleSequential(resolveInterpolator(scheme))
    .domain(reverse ? [colorDomain[1], colorDomain[0]] : colorDomain);

  const tickValues =
    pivot !== null ? [domain[0], pivot, domain[1]] : [domain[0], domain[1]];

  // Geometry
  const lowLabelText = lowOutlierColor ? `<${formatNumber(domain[0])}` : '';
  const highLabelText = highOutlierColor ? `>${formatNumber(domain[1])}` : '';

  const outerSpace = (labelText: string): number => {
    if (!labelText) return 0;
    const labelWidth = Math.ceil(measureTextWidth(labelText));
    return Math.max(LAYOUT.swatchWidth, labelWidth);
  };

  // The axis tick labels at domain[0]/domain[1] are centered on the gradient
  // edges and extend outward by half their text width. When outlier swatches
  // are present, the inner gap between the swatch and the gradient edge must
  // be wide enough to clear the tick label plus a small padding.
  const TICK_GAP = 8;
  const minTickHalfW = lowOutlierColor
    ? Math.ceil(measureTextWidth(formatNumber(domain[0])) / 2)
    : 0;
  const maxTickHalfW = highOutlierColor
    ? Math.ceil(measureTextWidth(formatNumber(domain[1])) / 2)
    : 0;

  const lowSideMargin = lowOutlierColor
    ? Math.max(LAYOUT.sideMargin, minTickHalfW + TICK_GAP)
    : LAYOUT.sideMargin;
  const highSideMargin = highOutlierColor
    ? Math.max(LAYOUT.sideMargin, maxTickHalfW + TICK_GAP)
    : LAYOUT.sideMargin;

  const lowReserve = lowOutlierColor
    ? outerSpace(lowLabelText) + LAYOUT.swatchGutter
    : 0;
  const highReserve = highOutlierColor
    ? outerSpace(highLabelText) + LAYOUT.swatchGutter
    : 0;

  const gradientX0 = lowReserve + lowSideMargin;
  const gradientX1 = width - highReserve - highSideMargin;
  const gradientWidth = gradientX1 - gradientX0;

  // Build the SVG
  const svg = d3.create('svg').attr('width', width).attr('height', height);

  // Title
  svg
    .append('text')
    .attr('x', gradientX0)
    .attr('y', LAYOUT.labelY)
    .style('font-family', LAYOUT.fontFamily)
    .style('font-size', LAYOUT.fontSize)
    .text(label);

  // Gradient definition
  const uniqueSuffix = Math.floor(Math.random() * 10000000);
  const gradientId = 'ramp-gradient-' + uniqueSuffix;
  const stripePatternId = 'ramp-stripes-' + uniqueSuffix;
  const defs = svg.append('defs');
  const gradient = defs
    .append('linearGradient')
    .attr('id', gradientId)
    .attr('x1', '0%')
    .attr('x2', '100%');

  const stopScale = d3
    .scaleLinear()
    .domain([0, LAYOUT.gradientStops])
    .range(domain);
  for (let i = 0; i <= LAYOUT.gradientStops; i++) {
    const t =
      i === 0
        ? domain[0]
        : i === LAYOUT.gradientStops
          ? domain[1]
          : stopScale(i);
    gradient
      .append('stop')
      .attr('offset', `${(100 * i) / LAYOUT.gradientStops}%`)
      .attr('stop-color', colorScale(t));
  }

  // Diagonal stripe pattern for outlier swatches
  if (stripedOutliers && (lowOutlierColor || highOutlierColor)) {
    const s = LAYOUT.stripeSpacing;
    const pattern = defs
      .append('pattern')
      .attr('id', stripePatternId)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', s)
      .attr('height', s)
      .attr('patternTransform', 'rotate(45)');
    pattern
      .append('line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 0)
      .attr('y2', s)
      .attr('stroke', LAYOUT.stripeColor)
      .attr('stroke-width', LAYOUT.stripeWidth);
  }

  // Gradient rect
  svg
    .append('rect')
    .attr('x', gradientX0)
    .attr('y', LAYOUT.rampTop)
    .attr('width', gradientWidth)
    .attr('height', rampHeight)
    .attr('fill', `url(#${gradientId})`);

  // Axis ticks under the gradient
  const tickScale = d3.scaleLinear().domain(domain).range([0, gradientWidth]);
  const axis = d3
    .axisBottom(tickScale)
    .tickValues(tickValues)
    .tickSize(rampHeight)
    .tickSizeOuter(0)
    .tickFormat((d) => formatNumber(d as number));

  const axisG = svg
    .append('g')
    .attr('transform', `translate(${gradientX0}, ${LAYOUT.rampTop})`)
    .style('font-size', LAYOUT.fontSize)
    .style('color', LAYOUT.textColor)
    .style('stroke-width', '1px')
    .call(axis);

  axisG.selectAll('.tick line').attr('stroke', LAYOUT.textColor);

  // Nudge middle tick label if pivot is close to left edge
  if (tickValues.length === 3) {
    const percent =
      (tickValues[1] * 100) / (tickValues[2] - tickValues[0]);
    if (percent < 5) {
      const nudge = Math.trunc(tickValues[0].toString().length * 8);
      const middleTickValue = Math.trunc(tickValues[1]);
      axisG
        .selectAll('.tick text')
        .filter(function () {
          const textVal = +(d3.select(this).text().replaceAll(',', ''));
          return textVal >= middleTickValue - 10 && textVal <= middleTickValue + 10;
        })
        .attr('transform', `translate(${nudge})`);
    }
  }

  // Outlier swatch + label
  const drawOutlier = (
    centerX: number,
    color: string,
    anchor: string,
    text: string,
  ) => {
    const swatchX = centerX - LAYOUT.swatchWidth / 2;

    svg
      .append('rect')
      .attr('x', swatchX)
      .attr('y', LAYOUT.rampTop)
      .attr('width', LAYOUT.swatchWidth)
      .attr('height', rampHeight)
      .attr('rx', LAYOUT.swatchRadius)
      .attr('ry', LAYOUT.swatchRadius)
      .attr('fill', color);

    if (stripedOutliers) {
      svg
        .append('rect')
        .attr('x', swatchX)
        .attr('y', LAYOUT.rampTop)
        .attr('width', LAYOUT.swatchWidth)
        .attr('height', rampHeight)
        .attr('rx', LAYOUT.swatchRadius)
        .attr('ry', LAYOUT.swatchRadius)
        .attr('fill', `url(#${stripePatternId})`);
    }

    svg
      .append('text')
      .attr(
        'x',
        centerX -
          (anchor === 'start'
            ? LAYOUT.swatchWidth / 2
            : -LAYOUT.swatchWidth / 2),
      )
      .attr('y', LAYOUT.tickLabelY)
      .attr('text-anchor', anchor)
      .attr('fill', LAYOUT.textColor)
      .style('font-size', LAYOUT.fontSize)
      .style('font-family', LAYOUT.fontFamily)
      .text(text);
  };

  if (lowOutlierColor) {
    const centerX = gradientX0 - lowSideMargin - LAYOUT.swatchWidth / 2;
    drawOutlier(centerX, lowOutlierColor, 'end', lowLabelText);
  }
  if (highOutlierColor) {
    const centerX = gradientX1 + highSideMargin + LAYOUT.swatchWidth / 2;
    drawOutlier(centerX, highOutlierColor, 'start', highLabelText);
  }

  container.replaceChildren(svg.node()!);
}

// --- App-specific wrapper ---

export function renderColorLegend(
  container: HTMLElement,
  colorConfig: ColorConfig | null,
  state: MapsState,
): void {
  if (!colorConfig || !colorConfig.valid) {
    container.replaceChildren();
    return;
  }

  renderColorLegendGeneric({
    container,
    domain: colorConfig.domain,
    scheme: colorConfig.trimmedScheme ?? colorConfig.scheme,
    label: MEASURE_LABEL[state.measure],
    pivot: colorConfig.pivot,
    reverse: colorConfig.reverse,
    lowOutlierColor: colorConfig.lowOutlierColor || false,
    highOutlierColor: colorConfig.highOutlierColor || false,
    stripedOutliers: state.stripedExtremes,
    width: 400,
    height: 50,
  });
}
