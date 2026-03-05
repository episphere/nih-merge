/**
 * Map hover tooltip — shows region name, value, and data distribution histogram.
 * Attaches mouseover/mousemove/mouseleave directly to geo paths after each render.
 */

import * as d3 from 'd3';
import * as Plot from '@observablehq/plot';
import { createTooltip, type TooltipHandle } from '../shared/tooltip';
import { fipsName } from '../shared/fips';
import type { ColorConfig } from './query';

export interface CardInfo {
  row: Record<string, unknown> | undefined;
  spatialLevel: 'county' | 'state';
  measure: string;
}

export interface MapTooltipHandle {
  updateHistogram(allValues: number[], colorConfig: ColorConfig): void;
  bindCard(container: HTMLElement, cardIndex: number, features: { id: string }[]): void;
  destroy(): void;
}

export function initMapTooltip(
  getCardInfo: (cardIndex: number, featureId: string) => CardInfo | null,
): MapTooltipHandle {
  const tooltip: TooltipHandle = createTooltip();

  // Create content elements (reused across hovers)
  const nameEl = document.createElement('div');
  nameEl.className = 'epi-tooltip__name';

  const valueEl = document.createElement('div');
  valueEl.className = 'epi-tooltip__value';

  const histogramContainer = document.createElement('div');
  histogramContainer.className = 'epi-tooltip__histogram';

  tooltip.contentEl.append(nameEl, valueEl, histogramContainer);

  // Histogram state
  let redDot: SVGCircleElement | null = null;
  let histogramXScale: d3.ScaleLinear<number, number> | null = null;

  function buildHistogram(values: number[], colorConfig: ColorConfig) {
    histogramContainer.replaceChildren();
    histogramXScale = null;
    redDot = null;

    if (values.length === 0) return;

    const [lo, hi] = colorConfig.domain;
    const filtered = values.filter((v) => v >= lo && v <= hi);
    if (filtered.length === 0) return;

    const extent = d3.extent(filtered) as [number, number];

    const plot = Plot.plot({
      width: 150,
      height: 60,
      marginTop: 2,
      marginRight: 2,
      marginBottom: 18,
      marginLeft: 2,
      x: { domain: extent, ticks: 3, tickSize: 3 },
      y: { axis: null },
      marks: [
        Plot.rectY(
          filtered,
          {
            ...Plot.binX(
              { y: 'count' },
              { x: (d: number) => d, thresholds: 20 },
            ),
            fill: '#c0d3ca',
          } as Plot.RectYOptions,
        ),
      ],
    });

    const svg = plot as unknown as SVGSVGElement;
    svg.style.display = 'block';
    histogramContainer.appendChild(svg);

    histogramXScale = d3.scaleLinear().domain(extent).range([2, 148]);

    const svgNS = 'http://www.w3.org/2000/svg';
    redDot = document.createElementNS(svgNS, 'circle');
    redDot.setAttribute('r', '3');
    redDot.setAttribute('fill', 'red');
    redDot.setAttribute('cy', String(60 - 18)); // baseline = height - marginBottom
    redDot.style.display = 'none';
    svg.appendChild(redDot);
  }

  function positionRedDot(value: number) {
    if (!redDot || !histogramXScale) return;
    redDot.setAttribute('cx', String(histogramXScale(value)));
    redDot.style.display = '';
  }

  function formatValue(val: number): string {
    if (val % 1 !== 0) return val.toFixed(1);
    return String(val);
  }

  /**
   * Attach hover events to all geo paths inside a rendered map card.
   * `features` is the ordered feature array that Plot used to render paths —
   * Plot 0.6 binds the array index (not the feature) to each path's __data__.
   */
  function bindCard(container: HTMLElement, cardIndex: number, features: { id: string }[]) {
    const firstGroup = container.querySelector<SVGGElement>("g[aria-label='geo']");
    if (!firstGroup) return;

    const paths = firstGroup.querySelectorAll<SVGPathElement>('path');

    for (const path of paths) {
      const idx = (path as unknown as { __data__?: number }).__data__;
      if (typeof idx !== 'number') continue;
      const feature = features[idx];
      if (!feature?.id) continue;

      path.addEventListener('mousemove', (e: MouseEvent) => {
        const featureId = feature.id;
        const info = getCardInfo(cardIndex, featureId);
        if (!info?.row) return;

        const val = info.row[info.measure] as number | undefined;

        // Build region name
        let name = (info.row['regionName'] as string) ?? featureId;
        if (info.spatialLevel === 'county' && featureId.length === 5) {
          const stateFips = featureId.slice(0, 2);
          const stateName = fipsName(stateFips);
          if (stateName !== stateFips) {
            name = `${name}, ${stateName}`;
          }
        }

        nameEl.textContent = name;
        valueEl.textContent = val != null ? formatValue(val) : 'N/A';

        if (val != null) {
          positionRedDot(val);
        } else if (redDot) {
          redDot.style.display = 'none';
        }

        d3.select(path).raise();
        tooltip.show(e.clientX, e.clientY);
      });

      path.addEventListener('mouseleave', () => {
        tooltip.hide();
      });
    }
  }

  return {
    updateHistogram(allValues: number[], colorConfig: ColorConfig) {
      buildHistogram(allValues, colorConfig);
    },
    bindCard,
    destroy() {
      tooltip.destroy();
    },
  };
}
