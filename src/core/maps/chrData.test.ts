import { describe, expect, it, vi } from 'vitest';
import { chooseChrPeriods, chrPeriodChoices, earliestMortalityYear, parseChrSeries } from './chrData';
import { chrField } from './chrFields';
import { DEFAULT_CARD, type Card } from './state';
import * as repository from '../../data-access/chr-repository';
import type { QuantileDetail } from '../../data-access/chr-repository';

describe('CHR observations', () => {
  const csv = 'chr_vintage,fipscode,chr_field_id,value,quantile_04\r\n'
    + '2025,01001,v009,0.184,2\r\n2025,01003,v009,,\r\n2025,01005,v009,0,1\r\n'
    + '2024,01001,v009,0.2,3\r\n2025,01001,v004,0.0005,1\r\n';
  it('selects the exact field and vintage, preserves FIPS and converts proportions', () => {
    expect(parseChrSeries(csv, '2025', 'v009', 100)).toEqual([
      { countyFips: '01001', stateFips: '01', rawValue: 0.184, value: 18.4 },
      { countyFips: '01003', stateFips: '01', rawValue: null, value: null },
      { countyFips: '01005', stateFips: '01', rawValue: 0, value: 0 },
    ]);
  });
  it('does not mislabel small provider rates as percentages', () => {
    const field = chrField('v004');
    expect(field.unit).toBe('per 100,000 residents');
    expect(parseChrSeries(csv, '2025', field.id, field.multiplier)[0].value).toBe(50);
  });
});

function detail(chrVintage: string, dataYears: string, fieldId = 'v009'): QuantileDetail {
  return { chrVintage, dataYears, fieldId, name: 'Characteristic', category: 'Health Behaviors',
    source: 'Source', proportionValid: 1, totalCounties: 3142, validCounties: 3142,
    unit: '%', nQuantiles: '4', quantileRanges: [[0, 25], [25, 50], [50, 75], [75, 100]] };
}

function detailsIndex(...details: QuantileDetail[]) {
  return new Map(details.map(entry => [`${entry.fieldId}|4|${entry.chrVintage}`, entry]));
}

function mortality(year: typeof DEFAULT_CARD.year): Card {
  return { x: 1, y: 1, blank: false, state: { ...DEFAULT_CARD, source: 'mortality', year } };
}

describe('CHR data-year selection', () => {
  it('uses the start of pooled mortality periods and ignores population, CHR and blank cards', () => {
    const pooled = mortality('2018-2024');
    expect(earliestMortalityYear([mortality('2024'), pooled])).toBe('2018');
    expect(earliestMortalityYear([
      mortality('2021'),
      { ...mortality('2018'), state: { ...DEFAULT_CARD, source: 'population', year: '2018' } },
      { ...mortality('2018'), state: { ...DEFAULT_CARD, source: 'chr', year: '2018' } },
      { ...mortality('2018'), blank: true },
    ])).toBe('2021');
  });

  it('defaults to the CC-matched observations and shows each data-year range once', () => {
    const recommended = detail('2018', '2016');
    const result = chooseChrPeriods(detailsIndex(recommended, detail('2019', '2016'), detail('2025', '2022')), 'v009', recommended);
    expect(result.selected).toBe(recommended);
    expect(result.options.map(entry => entry.dataYears)).toEqual(['2022', '2016']);
    expect(result.options[1].chrVintage).toBe('2018');
  });

  it('chooses the latest actual data when release ordering differs from measurement years', () => {
    const result = chooseChrPeriods(detailsIndex(detail('2025', '2020', 'v156'), detail('2024', '2023', 'v156')), 'v156');
    expect(result.selected.dataYears).toBe('2023');
    expect(result.selected.chrVintage).toBe('2024');
  });

  it('preserves an existing card or clone even if another period is now recommended', () => {
    const recommended = detail('2020', '2017');
    const result = chooseChrPeriods(detailsIndex(detail('2018', '2016'), detail('2019', '2016'), recommended), 'v009', recommended, '2018');
    expect(result.selected.chrVintage).toBe('2018');
    expect(result.options.find(entry => entry.dataYears === '2016')?.chrVintage).toBe('2018');
  });

  it('uses the same repository assignment as CC for the earliest mortality year', async () => {
    const recommended = detail('2020', '2017');
    const index = detailsIndex(recommended, detail('2025', '2022'));
    vi.spyOn(repository, 'loadQuantileDetails').mockResolvedValue(index);
    const lookup = vi.spyOn(repository, 'getQuantileDetail').mockResolvedValue(recommended);
    try {
      const result = await chrPeriodChoices('v009', [mortality('2024'), mortality('2018')]);
      expect(lookup).toHaveBeenCalledWith(index, 'v009', '4', '2018');
      expect(result.selected).toBe(recommended);
    } finally { vi.restoreAllMocks(); }
  });

  it('uses latest data when no mortality maps or no matching recommendation exist', async () => {
    const index = detailsIndex(detail('2018', '2016'), detail('2025', '2022'));
    vi.spyOn(repository, 'loadQuantileDetails').mockResolvedValue(index);
    const lookup = vi.spyOn(repository, 'getQuantileDetail').mockResolvedValue(undefined);
    try {
      expect((await chrPeriodChoices('v009', [])).selected.dataYears).toBe('2022');
      expect(lookup).not.toHaveBeenCalled();
      expect((await chrPeriodChoices('v009', [mortality('2018')])).selected.dataYears).toBe('2022');
    } finally { vi.restoreAllMocks(); }
  });
});
