/**
 * Map hover tooltip — shows region name, value, and multi-card density plot.
 * Attaches mouseover/mousemove/mouseleave directly to geo paths after each render.
 */

import * as d3 from 'd3';
import * as Plot from '@observablehq/plot';
import { density1d } from 'fast-kde';
import { createTooltip, type TooltipHandle } from '../shared/tooltip';
import { fipsName } from '../shared/fips';
import type { ColorConfig } from './query';
import { PALETTE } from '../shared/visual';

export interface CardInfo {
  row: Record<string, unknown> | undefined;
  spatialLevel: 'county' | 'state';
  measure: string;
}

export interface CardDensityData {
  cardIndex: number;
  values: number[];
}

export interface MapTooltipHandle {
  updateDensity(cardData: CardDensityData[], colorConfig: ColorConfig): void;
  bindCard(container: HTMLElement, cardIndex: number, features: { id: string }[]): void;
  destroy(): void;
}

const CARD_COLORS = [
  PALETTE.teal, PALETTE.orange, PALETTE.blue, PALETTE.pink,
  PALETTE.skyBlue, PALETTE.red, PALETTE.grey,
];

export function initMapTooltip(
  getCardInfo: (cardIndex: number, featureId: string) => CardInfo | null,
): MapTooltipHandle {
  const tooltip: TooltipHandle = createTooltip();

  const nameEl = document.createElement('div');
  nameEl.className = 'epi-tooltip__name';

  const valueEl = document.createElement('div');
  valueEl.className = 'epi-tooltip__value';

  const densityContainer = document.createElement('div');
  densityContainer.className = 'epi-tooltip__density';

  tooltip.contentEl.append(nameEl, valueEl, densityContainer);

  // Density plot state
  let densityPaths = new Map<number, SVGPathElement>();
  let redDot: SVGCircleElement | null = null;
  let densityXScale: d3.ScaleLinear<number, number> | null = null;
  let storedCardData: CardDensityData[] = [];
  let storedColorConfig: ColorConfig | null = null;
  type DensityMode = 'normal' | 'expand-low' | 'expand-high';
  let currentMode: DensityMode = 'normal';

  function buildDensityPlot(
    cardData: CardDensityData[],
    colorConfig: ColorConfig,
    mode: DensityMode = 'normal',
  ) {
    densityContainer.replaceChildren();
    densityXScale = null;
    redDot = null;
    densityPaths = new Map();
    currentMode = mode;

    if (cardData.length === 0) return;

    const [lo, hi] = colorConfig.domain;

    // Filter values per card based on mode
    const filteredCards: { cardIndex: number; values: number[] }[] = [];
    for (const cd of cardData) {
      let filtered: number[];
      if (mode === 'expand-low') {
        filtered = cd.values.filter((v) => v <= hi);
      } else if (mode === 'expand-high') {
        filtered = cd.values.filter((v) => v >= lo);
      } else {
        filtered = cd.values.filter((v) => v >= lo && v <= hi);
      }
      if (filtered.length > 0) {
        filteredCards.push({ cardIndex: cd.cardIndex, values: filtered });
      }
    }
    if (filteredCards.length === 0) return;

    // Compute shared extent across all filtered values
    let allMin = Infinity;
    let allMax = -Infinity;
    for (const fc of filteredCards) {
      for (const v of fc.values) {
        if (v < allMin) allMin = v;
        if (v > allMax) allMax = v;
      }
    }
    if (allMin === allMax) return; // zero-width extent

    const extent: [number, number] = [allMin, allMax];

    // Compute density per card, tagging each point with its cardIndex
    interface DensityPoint { x: number; y: number; card: number }
    const allPoints: DensityPoint[] = [];
    const isSingle = filteredCards.length === 1;
    const defaultOpacity = isSingle ? 0.5 : 0.35;

    for (const fc of filteredCards) {
      if (fc.values.length < 2) continue;
      const kde = density1d(fc.values, { extent, bins: 128 });
      for (const p of kde.points()) {
        allPoints.push({ x: p.x, y: p.y, card: fc.cardIndex });
      }
    }
    if (allPoints.length === 0) return;

    // Build color/opacity maps keyed by card index string
    const cardIndices = [...new Set(allPoints.map((d) => d.card))];
    const colorMap = Object.fromEntries(
      cardIndices.map((ci) => [String(ci), CARD_COLORS[ci % CARD_COLORS.length]]),
    );
    const opacityMap = Object.fromEntries(
      cardIndices.map((ci) => [String(ci), defaultOpacity]),
    );

    const plotOptions = {
      style: { fontSize: '12px' },
      width: 150,
      height: 60,
      marginTop: 2,
      marginRight: 15,
      marginBottom: 18,
      marginLeft: 15,
      x: { domain: extent, ticks: [lo, hi], tickSize: 3, label: null },
      y: { axis: null },
      marks: cardIndices.map((ci) =>
        Plot.areaY(
          allPoints.filter((d) => d.card === ci),
          {
            x: 'x',
            y: 'y',
            fill: colorMap[String(ci)],
            fillOpacity: opacityMap[String(ci)],
            curve: 'basis',
          },
        ),
      ),
    };

    const svg = Plot.plot(plotOptions as Parameters<typeof Plot.plot>[0]) as unknown as SVGSVGElement;
    svg.style.display = 'block';
    densityContainer.appendChild(svg);

    // Grab rendered path elements for highlight toggling.
    // Plot renders each areaY mark as a separate <g aria-label="area"> containing one <path>.
    const markPaths: SVGPathElement[] = [];
    for (const g of svg.querySelectorAll<SVGGElement>('g[aria-label="area"]')) {
      const p = g.querySelector<SVGPathElement>('path');
      if (p) markPaths.push(p);
    }
    for (let i = 0; i < cardIndices.length && i < markPaths.length; i++) {
      const path = markPaths[i];
      // Apply initial opacity via inline style so we have full control
      // (Observable Plot may set fill-opacity as an inline style, which
      // takes precedence over SVG presentation attributes).
      path.style.fillOpacity = String(defaultOpacity);
      densityPaths.set(cardIndices[i], path);
    }

    // Build x scale matching Plot's margins for red dot positioning
    densityXScale = d3.scaleLinear().domain(extent).range([15, 135]);

    // Red dot on baseline
    const svgNS = 'http://www.w3.org/2000/svg';
    redDot = document.createElementNS(svgNS, 'circle');
    redDot.setAttribute('r', '3');
    redDot.setAttribute('fill', 'red');
    redDot.setAttribute('cy', String(60 - 18)); // baseline = height - marginBottom
    redDot.style.display = 'none';
    svg.appendChild(redDot);
  }

  function positionRedDot(value: number) {
    if (!storedColorConfig || storedCardData.length === 0) return;

    const [lo, hi] = storedColorConfig.domain;
    let neededMode: DensityMode = 'normal';
    if (value < lo) neededMode = 'expand-low';
    else if (value > hi) neededMode = 'expand-high';

    if (neededMode !== currentMode) {
      buildDensityPlot(storedCardData, storedColorConfig, neededMode);
    }

    if (!redDot || !densityXScale) return;
    redDot.setAttribute('cx', String(densityXScale(value)));
    redDot.style.display = '';
  }

  function highlightCard(cardIndex: number | null) {
    const isSingle = densityPaths.size <= 1;
    for (const [ci, path] of densityPaths) {
      let opacity: number;
      if (cardIndex === null) {
        opacity = isSingle ? 0.5 : 0.35;
      } else if (ci === cardIndex) {
        opacity = 0.8;
      } else {
        opacity = 0.15;
      }
      path.style.fillOpacity = String(opacity);
    }
  }

  function formatValue(val: number): string {
    if (val % 1 !== 0) return val.toFixed(1);
    return String(val);
  }

  function bindCard(container: HTMLElement, cardIndex: number, features: { id: string }[]) {
    const firstGroup = container.querySelector<SVGGElement>("g[aria-label='geo']");
    if (!firstGroup) return;
    const svg = firstGroup.closest('svg');
    if (!svg) return;

    const highlightGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    highlightGroup.setAttribute('aria-label', 'hover-highlight');
    highlightGroup.style.pointerEvents = 'none';
    svg.appendChild(highlightGroup);

    let highlightClone: SVGPathElement | null = null;

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

        highlightCard(cardIndex);

        if (highlightClone) highlightClone.remove();
        highlightClone = path.cloneNode(false) as SVGPathElement;
        highlightClone.setAttribute('fill', 'none');
        highlightClone.setAttribute('stroke', '#1b1b1b');
        highlightClone.setAttribute('stroke-width', '2');
        highlightGroup.appendChild(highlightClone);

        tooltip.show(e.clientX, e.clientY);
      });

      path.addEventListener('mouseleave', () => {
        if (highlightClone) {
          highlightClone.remove();
          highlightClone = null;
        }
        highlightCard(null);
        tooltip.hide();
      });
    }
  }

  return {
    updateDensity(cardData: CardDensityData[], colorConfig: ColorConfig) {
      storedCardData = cardData;
      storedColorConfig = colorConfig;
      currentMode = 'normal';
      buildDensityPlot(cardData, colorConfig, 'normal');
    },
    bindCard,
    destroy() {
      tooltip.destroy();
    },
  };
}
