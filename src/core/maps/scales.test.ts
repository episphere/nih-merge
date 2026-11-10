import { describe, expect, it } from 'vitest';
import { DEFAULT_CARD, MAPS_DEFAULTS, resolveMaps, type CardState } from './state';
import { cardLetter, changeScaleMembership, compatibilityKey, compatibleGroups, defaultScale, scaleMembers, swapMapCards } from './scales';
import { computeCardScales, computeScaleConfig } from './query';

function dashboard() {
  return resolveMaps(MAPS_DEFAULTS, { nCols: 3, scales: {}, cards: [
    { id: 'mortality-a', x: 1, y: 1, blank: false, scaleId: 'rates', state: { ...DEFAULT_CARD, source: 'mortality', measure: 'ageAdjustedRate' } },
    { id: 'smoking', x: 2, y: 1, blank: false, scaleId: 'smoking', state: { ...DEFAULT_CARD, source: 'chr', chrField: 'v009' } },
    { id: 'mortality-b', x: 3, y: 1, blank: false, scaleId: 'rates', state: { ...DEFAULT_CARD, source: 'mortality', measure: 'ageAdjustedRate', year: '2023' } },
  ] });
}

describe('card scale ownership', () => {
  it('only offers compatible groups, allowing different years and populations', () => {
    const state = dashboard();
    expect(compatibleGroups(state, { ...state.cards[0].state!, sex: 'Female' }, 'mortality-a'))
      .toEqual([{ id: 'rates', indices: [2] }]);
    expect(compatibilityKey({ ...DEFAULT_CARD, source: 'chr', chrField: 'v011' }))
      .not.toBe(compatibilityKey(state.cards[1].state!));
    expect(compatibleGroups(state, { ...state.cards[0].state!, spatialLevel: 'state' })).toEqual([]);
  });

  it('keeps identity, appearance and membership with maps while letters follow positions', () => {
    const state = dashboard();
    const swapped = resolveMaps(state, { cards: swapMapCards(state, 1, 2) });
    expect(swapped.cards.map(card => card.id)).toEqual(['mortality-a', 'mortality-b', 'smoking']);
    expect(swapped.cards.map(card => card.x)).toEqual([1, 2, 3]);
    expect(scaleMembers(swapped, 'rates').map(cardLetter)).toEqual(['A', 'B']);
    expect(state.cards[1].id).toBe('smoking');
    expect(cardLetter(26)).toBe('AA');
  });

  it('leaving a group copies settings and cannot change the original group', () => {
    const state = dashboard();
    const original = state.scales.rates;
    const independent = resolveMaps(state, changeScaleMembership(state, 'mortality-b', 'independent', { ...original, colorScheme: 'Greens' }));
    const newId = independent.cards[2].scaleId!;
    expect(newId).not.toBe('rates');
    expect(independent.scales[newId].colorScheme).toBe('Greens');
    expect(independent.scales.rates).toEqual(original);
    const joined = resolveMaps(independent, changeScaleMembership(independent, 'mortality-b', 'rates', original));
    expect(scaleMembers(joined, 'rates')).toEqual([0, 2]);
    expect(joined.scales[newId]).toBeUndefined();
  });

  it('splits invalid memberships loaded from a URL and normalizes CHR filters', () => {
    const state = dashboard();
    const mixed = resolveMaps(state, { cards: state.cards.map(card => ({ ...card, scaleId: 'rates' })) });
    expect(mixed.cards[1].scaleId).not.toBe('rates');
    const chr = resolveMaps(state, { cards: state.cards.map(card => card.id === 'smoking'
      ? { ...card, state: { ...card.state!, spatialLevel: 'state', race: 'White', cause: 'Breast' } as CardState } : card) });
    expect(chr.cards[1].state).toMatchObject({ spatialLevel: 'county', race: 'All', cause: 'All' });
  });
});

describe('per-scale numeric domains', () => {
  it('never pools different measures and deduplicates overlapping observations', () => {
    const state = dashboard();
    state.scales.rates = { ...defaultScale(), colorExcludeExtremes: false };
    const row = (countyFips: string, ageAdjustedRate: number) => ({ countyFips, stateFips: countyFips.slice(0, 2), ageAdjustedRate });
    const data = new Map([
      [0, [row('01001', 100), row('01003', 200)]],
      [1, [{ countyFips: '01001', stateFips: '01', value: 18 }, { countyFips: '01003', stateFips: '01', value: 22 }]],
      [2, [row('01001', 300)]],
    ]);
    const configs = computeCardScales(state, data);
    expect(configs.get('rates')?.domain).toEqual([100, 300]);
    expect(configs.get('smoking')?.domain).toEqual([18, 22]);
    const sameYear = resolveMaps(state, { cards: state.cards.map(card => ({ ...card, state: card.state ? { ...card.state, year: '2024' } : null })) });
    data.set(2, [row('01001', 100)]);
    expect(computeCardScales(sameYear, data).get('rates')?.pivot).toBe(150);
  });

  it('marks values beyond custom bounds even when automatic exclusion is disabled', () => {
    const config = computeScaleConfig(new Map([[0, [{ value: 1 }, { value: 20 }, { value: 100 }]]]),
      { ...defaultScale('chr'), domainMin: 10, domainMax: 50 }, 'value');
    expect(config?.domain).toEqual([10, 50]);
    expect(config?.lowOutlierColor).toBeTruthy();
    expect(config?.highOutlierColor).toBeTruthy();
  });
});
