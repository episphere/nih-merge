import * as d3 from 'd3';
import * as Plot from '@observablehq/plot';
import type { ColorConfig, GeoData, GeoFeatureCollection } from './query';
import type { CardState, MapsState } from './state';

// --- Types ---

interface Overlay {
  featureCollection: GeoFeatureCollection | unknown[];
  strokeColor: string;
}

interface ChoroplethOptions {
  indexField: string;
  measureField: string;
  overlays: Overlay[];
  width: number;
  height: number;
  color: ColorConfig;
  strokeColor: string | null;
  showZeroValues: boolean;
}

// --- Choropleth plot ---

function createChoroplethPlot(
  data: Record<string, unknown>[],
  featureCollection: GeoFeatureCollection,
  options: ChoroplethOptions,
): SVGSVGElement {
  const { color, strokeColor, indexField, measureField } = options;
  const outlierColor = '#3d3d3d';

  const spatialDataMap = d3.index(data, (d) => d[indexField] as string);

  let colorDomain = [...color.domain] as [number, number];
  if (color.pivot != null) {
    const maxSide = Math.max(
      color.pivot - colorDomain[0],
      colorDomain[1] - color.pivot,
    );
    colorDomain = [color.pivot - maxSide, color.pivot + maxSide];
  }

  if (color.reverse) {
    colorDomain = [colorDomain[1], colorDomain[0]];
  }

  const interpolator = (d3 as Record<string, unknown>)[
    'interpolate' + color.scheme
  ] as (t: number) => string;
  const colorScale = d3.scaleSequential(interpolator).domain(colorDomain);

  const strokeFn = (feature: { id: string }) => {
    if (strokeColor) {
      return strokeColor;
    }
    return spatialDataMap.get(feature.id)?.[measureField] ? 'none' : '#dfe1e2';
  };

  const marks: Plot.Markish[] = [];

  marks.push(
    Plot.geo(featureCollection as unknown as GeoJSON.FeatureCollection, {
      stroke: strokeFn as unknown as Plot.ChannelValueSpec,
      fill: ((d: { id: string }) => {
        const row = spatialDataMap.get(d.id);
        if (row && row[measureField] != null) {
          const val = row[measureField] as number;
          if (!options.showZeroValues && val === 0) return 'white';
          if (val >= color.domain[0] && val <= color.domain[1]) {
            return colorScale(val);
          }
          return outlierColor;
        }
        return 'white';
      }) as unknown as Plot.ChannelValueSpec,
      strokeWidth: 1,
    }),
  );

  for (const overlay of options.overlays) {
    const fc = Array.isArray(overlay.featureCollection)
      ? { type: 'FeatureCollection' as const, features: overlay.featureCollection }
      : overlay.featureCollection;
    marks.push(
      Plot.geo(fc as unknown as GeoJSON.FeatureCollection, {
        stroke: overlay.strokeColor,
        fill: 'none',
        strokeWidth: 1.3,
        pointerEvents: 'none',
      }),
    );
  }

  const plot = Plot.plot({
    width: options.width,
    height: options.height,
    projection: {
      type: 'albers-usa',
      domain: featureCollection as unknown as GeoJSON.FeatureCollection,
    },
    marks,
  });

  const svg = plot as unknown as SVGSVGElement;
  svg.style.maxWidth = 'initial';

  // Resize SVG to fit content tightly
  requestAnimationFrame(() => {
    fitSvgToContent(svg, 5);
  });

  return svg;
}

// --- SVG fitting ---

function fitSvgToContent(svgNode: SVGSVGElement, padding = 0): void {
  const svg = d3.select(svgNode);

  const contentGroups = svg.selectAll("g[aria-label='geo']");
  if (contentGroups.empty()) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  contentGroups.each(function () {
    const bbox = (this as SVGGElement).getBBox();
    if (bbox.width === 0 && bbox.height === 0) return;
    minX = Math.min(minX, bbox.x);
    minY = Math.min(minY, bbox.y);
    maxX = Math.max(maxX, bbox.x + bbox.width);
    maxY = Math.max(maxY, bbox.y + bbox.height);
  });

  if (!isFinite(minX)) return;

  const finalX = minX - padding;
  const finalY = minY - padding;
  const finalWidth = maxX - minX + padding * 2;
  const finalHeight = maxY - minY + padding * 2;

  svg.attr('viewBox', `${finalX} ${finalY} ${finalWidth} ${finalHeight}`);
  svg.attr('width', finalWidth);
  svg.attr('height', finalHeight);
}

// --- Public: render a card's map into a container ---

export function renderMapCard(
  container: HTMLElement,
  cardState: CardState,
  data: Record<string, unknown>[],
  colorConfig: ColorConfig,
  geoData: GeoData,
  globalState: MapsState,
): GeoFeatureCollection | null {
  const bbox = container.getBoundingClientRect();
  if (bbox.width === 0 || bbox.height === 0) return null;

  const indexField = cardState.spatialLevel === 'county' ? 'countyFips' : 'stateFips';
  const { countyGeoJSON, stateGeoJSON, nationGeoJSON } = geoData;

  // Determine primary feature collection based on spatial level and state filter
  let featureCollection: GeoFeatureCollection;
  let mapOutline: GeoFeatureCollection | unknown[];

  if (cardState.spatialLevel === 'county') {
    if (cardState.stateFips !== 'All') {
      // Filter counties to selected state
      featureCollection = {
        type: 'FeatureCollection',
        features: countyGeoJSON.features.filter((d) =>
          d.id.startsWith(cardState.stateFips),
        ),
      };
      mapOutline = stateGeoJSON.features.filter((d) => d.id === cardState.stateFips);
    } else {
      featureCollection = countyGeoJSON;
      mapOutline = nationGeoJSON;
    }
  } else {
    if (cardState.stateFips !== 'All') {
      featureCollection = {
        type: 'FeatureCollection',
        features: stateGeoJSON.features.filter((d) => d.id === cardState.stateFips),
      };
      mapOutline = stateGeoJSON.features.filter((d) => d.id === cardState.stateFips);
    } else {
      featureCollection = stateGeoJSON;
      mapOutline = nationGeoJSON;
    }
  }

  // Build overlays
  const overlays: Overlay[] = [];
  if (
    cardState.stateFips === 'All' &&
    globalState.showOutlineState
  ) {
    overlays.push({
      featureCollection: stateGeoJSON.features,
      strokeColor: '#a9aeb1',
    });
  }

  if (globalState.showOutlineNation) {
    overlays.push({
      featureCollection: mapOutline,
      strokeColor: '#3d4551',
    });
  }

  const plot = createChoroplethPlot(data, featureCollection, {
    indexField,
    measureField: globalState.measure,
    overlays,
    width: bbox.width - 30,
    height: bbox.height - 30,
    color: colorConfig,
    strokeColor: globalState.showOutlineCounty ? 'lightgrey' : null,
    showZeroValues: globalState.showZeroValues,
  });

  container.replaceChildren(plot);
  return featureCollection;
}
