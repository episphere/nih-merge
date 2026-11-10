import { describe, expect, it } from 'vitest';
import { MAPS_DEFAULTS, DEFAULT_CARD, resolveMaps } from './state';
import { decodeLegacyMaps, decodeMapsConfiguration, encodeMapsConfiguration } from './urlSync';
import { defaultScale } from './scales';

describe('map configuration URLs', () => {
  it('round-trips mixed cards, shared settings, minimized legends and trailing blanks', () => {
    const state = resolveMaps(MAPS_DEFAULTS, { nCols: 3, cards: [
      { id: 'a', x: 1, y: 1, blank: false, state: { ...DEFAULT_CARD, source: 'mortality' }, scaleId: 'rates', legendMode: 'minimized' },
      { id: 'b', x: 2, y: 1, blank: false, state: { ...DEFAULT_CARD, source: 'chr', chrField: 'v009', chrVintage: '2025' }, scaleId: 'chr' },
      { id: 'c', x: 3, y: 1, blank: true, state: null },
    ], scales: { rates: { ...defaultScale(), domainMin: 0, domainMax: 300 }, chr: defaultScale('chr') } });
    const restored = resolveMaps(MAPS_DEFAULTS, decodeMapsConfiguration(encodeMapsConfiguration(state)));
    expect(restored.cards).toEqual(state.cards);
    expect(restored.scales).toEqual(state.scales);
  });

  it('migrates legacy global palettes and measures into compatible shared scales', () => {
    const state = resolveMaps(MAPS_DEFAULTS, decodeLegacyMaps(new URLSearchParams({ nCols: '2', measure: 'population', colorScheme: 'Purples',
      colorCenterMean: '0', colorExcludeExtremes: '0', cards: ';year=2023' })));
    expect(state.cards.map(card => card.state?.measure)).toEqual(['population', 'population']);
    expect(state.cards[0].scaleId).toBe(state.cards[1].scaleId);
    expect(state.scales[state.cards[0].scaleId!]).toMatchObject({ colorScheme: 'Purples', colorCenterMean: false, colorExcludeExtremes: false });
  });

  it('restores the removed reduced view as a minimized legend', () => {
    const configuration = { version: 2, nRows: 1, nCols: 1,
      cards: [{ state: DEFAULT_CARD, legendMode: 'reduced' }] };
    expect(decodeMapsConfiguration(JSON.stringify(configuration)).cards?.[0].legendMode).toBe('minimized');
  });

  it('bounds untrusted grid sizes and discards invalid settings', () => {
    const restored = decodeMapsConfiguration(JSON.stringify({ version: 2, nRows: 1, nCols: 100000,
      cards: [{ state: { ...DEFAULT_CARD, source: 'chr', chrField: 'not-a-field' }, scaleId: 'a' }],
      scales: { a: { colorScheme: 'not-a-scheme', domainMin: 50, domainMax: 10, gamma: 500 } } }));
    expect(restored.nCols).toBe(8);
    expect(restored.cards?.[0].state?.chrField).toBe('v009');
    expect(restored.scales?.a).toMatchObject({ colorScheme: 'RdYlBu', domainMin: null, domainMax: null, gamma: 2 });
  });
});
