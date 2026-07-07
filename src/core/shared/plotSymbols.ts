import * as d3 from 'd3';

const PLOT_SYMBOLS: Record<string, d3.SymbolType> = {
  asterisk: d3.symbolAsterisk,
  circle: d3.symbolCircle,
  cross: d3.symbolCross,
  diamond: d3.symbolDiamond,
  diamond2: d3.symbolDiamond2,
  plus: d3.symbolPlus,
  square: d3.symbolSquare,
  square2: d3.symbolSquare2,
  star: d3.symbolStar,
  times: d3.symbolTimes,
  triangle: d3.symbolTriangle,
  triangle2: d3.symbolTriangle2,
  wye: d3.symbolWye,
};

export function plotSymbolPath(symbol: string | undefined, size = 95): string {
  return d3.symbol(PLOT_SYMBOLS[symbol ?? 'circle'] ?? d3.symbolCircle, size)() ?? '';
}
