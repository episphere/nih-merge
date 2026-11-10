import { describe, expect, it } from 'vitest';
import { buildMapTableView } from './table';
import { DEFAULT_CARD, MAPS_DEFAULTS, resolveMaps } from './state';
import { swapMapCards } from './scales';

function fixture() {
  const state = resolveMaps(MAPS_DEFAULTS, { nCols: 2, cards: [
    { id: 'mortality', x: 1, y: 1, blank: false, state: { ...DEFAULT_CARD, source: 'mortality' } },
    { id: 'smoking', x: 2, y: 1, blank: false, state: { ...DEFAULT_CARD, source: 'chr', chrField: 'v009', chrVintage: '2025' } },
  ] });
  const data = new Map<string, { rows: Record<string, unknown>[] }>([
    ['mortality', { rows: [{ regionName: 'Autauga', stateFips: '01', countyFips: '01001', deaths: 80, population: 55000, ageAdjustedRate: 180, crudeRate: 145 }] }],
    ['smoking', { rows: [{ regionName: 'Autauga', stateFips: '01', countyFips: '01001', value: 18.4, rawValue: 0.184, dataYears: '2022', chrVintage: '2025', dataSource: 'BRFSS' }] }],
  ]);
  return { state, data };
}

describe('per-map tables', () => {
  it('restores mortality context columns without repeating map settings visibly', () => {
    const { state, data } = fixture();
    const view = buildMapTableView(state, data);
    expect(view.selectedChoiceId).toBe('mortality');
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({ countyName: 'Autauga', stateName: 'Alabama', deaths: 80, population: 55000, ageAdjustedRate: 180 });
    expect(view.presentation.fixedColumns).toEqual(['countyName', 'stateName']);
    expect(view.presentation.defaultNumericColumns).toEqual(['deaths', 'population', 'ageAdjustedRate']);
    expect(view.presentation.optionalColumns).toContain('countyFips');
    expect(view.subtitle).toContain('2024 · All cancers · All sexes');
  });

  it('shows a named CHR measure with units and no borrowed mortality observations', () => {
    const { state, data } = fixture();
    const view = buildMapTableView(state, data, 'smoking');
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0].v009).toBe(18.4);
    expect(view.rows[0]).not.toHaveProperty('population');
    expect(view.rows[0]).not.toHaveProperty('deaths');
    expect(view.presentation.defaultNumericColumns).toEqual(['v009']);
    expect(view.presentation.aliases?.columns?.v009).toBe('Adult Smoking (%)');
    expect(view.subtitle).toBe('Data 2022 · US');
    expect(view.presentation.optionalColumns).toContain('chrVintage');
  });

  it('keeps the selected card through a swap while updating its position label', () => {
    const { state, data } = fixture();
    const swapped = resolveMaps(state, { cards: swapMapCards(state, 0, 1) });
    const view = buildMapTableView(swapped, data, 'smoking');
    expect(view.selectedChoiceId).toBe('smoking');
    expect(view.choices?.[0].label).toBe('A · Adult Smoking · 2022');
    expect(view.rows[0].v009).toBe(18.4);
  });

  it('uses only the state and population for a population state map', () => {
    const { state, data } = fixture();
    const population = resolveMaps(state, { cards: [{ ...state.cards[0], state: { ...DEFAULT_CARD, source: 'population', spatialLevel: 'state' } }] });
    const rows = new Map([['mortality', { rows: [{ regionName: 'Alabama', stateFips: '01', population: 5000000 }] }]]);
    const view = buildMapTableView(population, rows);
    expect(view.presentation.fixedColumns).toEqual(['stateName']);
    expect(view.presentation.defaultNumericColumns).toEqual(['population']);
    expect(view.rows[0]).not.toHaveProperty('countyName');
    expect(view.rows[0]).not.toHaveProperty('countyFips');
    expect(view.rows[0]).not.toHaveProperty('deaths');
    // Removing the selected map falls back to another available map.
    expect(buildMapTableView(state, data, 'removed-card').selectedChoiceId).toBe('mortality');
  });
});
