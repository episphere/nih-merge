declare module 'fast-kde' {
  interface Density1DEstimator {
    points(x?: string, y?: string): IterableIterator<{ x: number; y: number }>;
    grid(): Float64Array;
    extent(): [number, number];
    bandwidth(value?: number): number | Density1DEstimator;
    [Symbol.iterator]: () => IterableIterator<{ x: number; y: number }>;
  }

  interface Density1DOptions {
    x?: (d: unknown) => number;
    weight?: (d: unknown) => number;
    bandwidth?: number;
    adjust?: number;
    pad?: number;
    bins?: number;
    extent?: [number, number];
  }

  export function density1d(data: number[], options?: Density1DOptions): Density1DEstimator;
}
